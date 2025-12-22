const express = require('express');    // to bring Express library from node_modules 
const fs = require('fs');              // for file operations, reading and writing 
const path = require('path');           // to deal correctly with paths in different OS 
const axios = require('axios');         // NEW: to send http requests (invalidate + replication)
const app = express();                  // we created web app, then we register the routes (get, patch, post..)
app.use(express.json());                // make the server understand the json in the body (requests)

/* ======================= */
/* Part 2 - ENV variables  */
/* ======================= */

// NEW: read port from environment to allow running multiple replicas
const PORT = process.env.PORT || 4000;

// NEW: read catalog file path from environment (each replica has its own file)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'catalog.json');

// NEW: peer catalog replica URL (used for replication)
const PEER_URL = process.env.PEER_URL;

// NEW: frontend URL (used for cache invalidation)
const FRONTEND_URL = process.env.FRONTEND_URL;

// Loading the catalog data from catalog.json file
const loadCatalog = () => {
    try {
        // UPDATED: use DB_FILE instead of hardcoded catalog.json
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error loading catalog:', err);
        return [];
    }
};

const saveCatalog = (catalog) => {
    try {
        // UPDATED: use DB_FILE instead of hardcoded catalog.json
        fs.writeFileSync(DB_FILE, JSON.stringify(catalog, null, 2));
    } catch (err) {
        console.error('Error saving catalog:', err);
    }
};

// NEW: send cache invalidation request to frontend before any write
const invalidateCache = async (id) => {
    if (!FRONTEND_URL) return; // NEW: skip if env not set
    try {
        await axios.post(`${FRONTEND_URL}/cache/invalidate/${id}`);
        console.log(`🧹 Sent cache invalidate to frontend for book ID: ${id}`);
    } catch (err) {
        console.error(`⚠️ Cache invalidate failed for book ID ${id}:`, err.message);
        // NEW: do not fail the whole request if cache invalidation fails
    }
};

// NEW: replicate update to peer replica to keep replicas in sync
const replicateUpdateToPeer = async (id, body) => {
    if (!PEER_URL) return; // NEW: skip if env not set
    try {
        await axios.patch(`${PEER_URL}/update/${id}`, body, {
            headers: { 'X-Replicated': '1' } // NEW: prevent infinite loops
        });
        console.log(`📡 Replicated update of book ID ${id} to peer replica`);
    } catch (err) {
        console.error(`⚠️ Replication failed for book ID ${id}:`, err.message);
        // NEW: in a stronger system we'd retry; here we log and continue
    }
};

// search by topic => search/topic
app.get('/search/:topic', (req, res) => {
    const topic = req.params.topic.toLowerCase();
    const catalog = loadCatalog();
    
    const results = catalog.filter(book => 
        book.topic.toLowerCase().includes(topic)
    );
    
    console.log(`📚 Search for "${topic}": Found ${results.length} books`);
    res.json(results);
});

// search by id => info/id
app.get('/info/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const catalog = loadCatalog();
    
    const book = catalog.find(b => b.id === id);
    
    if (!book) {
        return res.status(404).json({ error: 'Book not found' });
    }
    
    console.log(`ℹ️ Info request for book ID: ${id} - "${book.title}"`);
    res.json(book);
});

// update existing book, quantity or price
app.patch('/update/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { quantity, price } = req.body;
    
    let catalog = loadCatalog();
    const bookIndex = catalog.findIndex(b => b.id === id);
    
    if (bookIndex === -1) {
        return res.status(404).json({ error: 'Book not found' });
    }

    // NEW: detect replicated request to avoid re-replicating (prevents infinite loop)
    const isReplicated = req.headers['x-replicated'] === '1';

    // NEW: server-push invalidation BEFORE any write to DB (lab requirement)
    // backend replicas send invalidate requests to the in-memory cache prior to making any writes :contentReference[oaicite:2]{index=2}
    await invalidateCache(id);
    
    if (quantity !== undefined) {
        catalog[bookIndex].quantity = quantity;
    }
    if (price !== undefined) {
        catalog[bookIndex].price = price;
    }
    
    saveCatalog(catalog);

    // NEW: replicate the write to the other replica to keep them in sync (lab requirement)
    // writes to their database are also performed at the other replica :contentReference[oaicite:3]{index=3}
    if (!isReplicated) {
        await replicateUpdateToPeer(id, { quantity, price });
    }
    
    console.log(`🔄 Updated book ID: ${id} - Quantity: ${catalog[bookIndex].quantity}, Price: ${catalog[bookIndex].price}`);
    res.json({ message: 'Book updated', book: catalog[bookIndex] });
});

// get all books 
app.get('/books', (req, res) => {
    const catalog = loadCatalog();
    res.json(catalog);
});

// UPDATED: use PORT from environment instead of hardcoded value
app.listen(PORT, () => console.log(`📚 Catalog service running on port ${PORT}`)); // listen on port and give a msg when you are doing
