const express = require('express');    // to bring Express library from node_modules 
const fs = require('fs');              // for file operations, reading and writing 
const path = require('path');         // to deal correctly with paths in different OS 
const app = express();                // we created web app, then we register the routes (get, patch, post..)
app.use(express.json());              // make the server understand the json in the body (requests)

// Loading the catalog data from catalog.json file
const loadCatalog = () => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error loading catalog:', err);
        return [];
    }
};

const saveCatalog = (catalog) => {
    try {
        fs.writeFileSync(path.join(__dirname, 'catalog.json'), JSON.stringify(catalog, null, 2));
    } catch (err) {
        console.error('Error saving catalog:', err);
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
app.patch('/update/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { quantity, price } = req.body;
    
    let catalog = loadCatalog();
    const bookIndex = catalog.findIndex(b => b.id === id);
    
    if (bookIndex === -1) {
        return res.status(404).json({ error: 'Book not found' });
    }
    
    if (quantity !== undefined) {
        catalog[bookIndex].quantity = quantity;
    }
    if (price !== undefined) {
        catalog[bookIndex].price = price;
    }
    
    saveCatalog(catalog);
    
    console.log(`🔄 Updated book ID: ${id} - Quantity: ${catalog[bookIndex].quantity}, Price: ${catalog[bookIndex].price}`);
    res.json({ message: 'Book updated', book: catalog[bookIndex] });
});

// get all books 
app.get('/books', (req, res) => {
    const catalog = loadCatalog();
    res.json(catalog);
});

const PORT = 4000;
app.listen(PORT, () => console.log(`📚 Catalog service running on port ${PORT}`)); // listen on port 4000 and give a msg when you are doing
