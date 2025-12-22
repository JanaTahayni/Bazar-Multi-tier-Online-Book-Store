const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');   // to send http requests [to call catalog service]
const app = express();
app.use(express.json());

/* ======================= */
/* Part 2 - ENV variables  */
/* ======================= */

// NEW: read port from environment to allow running multiple replicas
const PORT = process.env.PORT || 5000;

// NEW: read orders file path from environment (each replica has its own file)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'orders.json');

// NEW: list of catalog replicas (frontend will use both, order can also use them)
const CATALOG_REPLICAS = process.env.CATALOG_REPLICAS || null;

// NEW: keep old env var for backward compatibility (your Part 1 style)
const CATALOG_URL = process.env.CATALOG_URL || 'http://localhost:4000';   // catalog url

// NEW: peer order replica URL (used later for replication)
const PEER_URL = process.env.PEER_URL;

// NEW: frontend URL (used later for cache invalidation - mainly catalog does it, but kept for completeness)
const FRONTEND_URL = process.env.FRONTEND_URL;

// NEW: simple round-robin index for catalog replicas (used later when CATALOG_REPLICAS is provided)
let catalogIndex = 0;

// NEW: choose catalog replica (if list exists), otherwise fallback to single CATALOG_URL
const pickCatalogBaseUrl = () => {
    if (!CATALOG_REPLICAS) return CATALOG_URL;
    const list = CATALOG_REPLICAS.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return CATALOG_URL;
    const chosen = list[catalogIndex % list.length];
    catalogIndex++;
    return chosen;
};

// load orders from orders.json file 
const loadOrders = () => {
    try {
        // UPDATED: use DB_FILE instead of hardcoded orders.json path
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

// save orders to orders.json file
const saveOrders = (orders) => {
    try {
        // UPDATED: use DB_FILE instead of hardcoded orders.json path
        fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2));
    } catch (err) {
        console.error('Error saving orders:', err);
    }
};

let orders = loadOrders();
let orderId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;

/* =============================== */
/* Part 2 - Replication (Order)    */
/* =============================== */

// NEW: replicate an order entry to the peer replica (prevents infinite loop with header)
const replicateOrderToPeer = async (orderObj) => {
    if (!PEER_URL) return; // NEW: if no peer configured, skip
    try {
        await axios.post(`${PEER_URL}/replicate/order`, orderObj, {
            headers: { 'X-Replicated': '1' } // NEW: prevents the peer from re-sending it back
        });
        console.log(`📡 Replicated order ID ${orderObj.id} to peer replica`);
    } catch (err) {
        console.error(`⚠️ Order replication failed for order ID ${orderObj.id}:`, err.message);
        // NEW: in a stronger system we'd retry; here we log and continue
    }
};

// NEW: internal endpoint for receiving replicated orders from peer
app.post('/replicate/order', (req, res) => {
    const incomingOrder = req.body;

    // NEW: validate basic shape
    if (!incomingOrder || incomingOrder.id === undefined) {
        return res.status(400).json({ error: 'Invalid replicated order' });
    }

    // NEW: avoid duplicates if the same order arrives twice
    const exists = orders.some(o => o.id === incomingOrder.id);
    if (!exists) {
        orders.push(incomingOrder);
        saveOrders(orders);

        // NEW: keep orderId monotonic on this replica too
        orderId = Math.max(orderId, incomingOrder.id + 1);

        console.log(`🧾 Received replicated order ID ${incomingOrder.id} and saved locally`);
    } else {
        console.log(`🧾 Replicated order ID ${incomingOrder.id} already exists (ignored)`);
    }

    res.json({ message: 'Replicated order processed', id: incomingOrder.id, existed: exists });
});

// purchase 
app.post('/purchase/:id', async (req, res) => {
    const bookId = parseInt(req.params.id);
    
    try {
// get book info
        // NEW: use a chosen catalog replica if available
        const catalogBaseUrl = pickCatalogBaseUrl();

        const bookResponse = await axios.get(`${catalogBaseUrl}/info/${bookId}`);
        const book = bookResponse.data;
        
        console.log(`🛒 Purchase request for: "${book.title}" - Current quantity: ${book.quantity}`);
        
// check if book is available (quantity > 0) 
        if (book.quantity <= 0) {
            return res.status(400).json({ error: 'Book out of stock' });
        }
        
// when purchase is done, decrease quantity 
        const newQuantity = book.quantity - 1;

        // NEW: decrement quantity using the same chosen replica (catalog will handle invalidation later)
        await axios.patch(`${catalogBaseUrl}/update/${bookId}`, {
            quantity: newQuantity
        });
        
// make order
        const newOrder = {
            id: orderId++,
            bookId: bookId,
            bookTitle: book.title,
            price: book.price,
            status: 'completed',
            timestamp: new Date().toISOString()
        };
        
        orders.push(newOrder);
        saveOrders(orders);

        // NEW: detect replicated request to avoid re-replicating (prevents infinite loops)
        const isReplicated = req.headers['x-replicated'] === '1';

        // NEW: replicate order write to peer replica to keep orders DB in sync (lab requirement)
        // writes to their database are also performed at the other replica :contentReference[oaicite:1]{index=1}
        if (!isReplicated) {
            await replicateOrderToPeer(newOrder);
        }
        
        console.log(`✅ Purchase successful! Order ID: ${newOrder.id}, Remaining quantity: ${newQuantity}`);
        
        res.json({ 
            message: 'Purchase successful!', 
            order: newOrder,
            remainingQuantity: newQuantity
        });
        
    } catch (err) {
        console.error('❌ Purchase error:', err.message);
        
        if (err.response && err.response.status === 404) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        res.status(500).json({ error: 'Purchase failed' });
    }
});

// get all orders list
app.get('/orders', (req, res) => {
    res.json(orders);
});

// search for specific order by id
app.get('/orders/:id', (req, res) => {
    const order = orders.find(o => o.id === parseInt(req.params.id));
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
});

// UPDATED: use PORT from environment instead of hardcoded value
app.listen(PORT, () => console.log(`🛒 Order service running on port ${PORT}`));
