const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');   // to send http requests [to call catalog service]
const app = express();
app.use(express.json());

const CATALOG_URL = process.env.CATALOG_URL || 'http://localhost:4000';   // catalog url

// load orders from orders.json file 
const loadOrders = () => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'orders.json'), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

// save orders to orders.json file
const saveOrders = (orders) => {
    try {
        fs.writeFileSync(path.join(__dirname, 'orders.json'), JSON.stringify(orders, null, 2));
    } catch (err) {
        console.error('Error saving orders:', err);
    }
};

let orders = loadOrders();
let orderId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;

// purchase 
app.post('/purchase/:id', async (req, res) => {
    const bookId = parseInt(req.params.id);
    
    try {
// get book info
        const bookResponse = await axios.get(`${CATALOG_URL}/info/${bookId}`);
        const book = bookResponse.data;
        
        console.log(`🛒 Purchase request for: "${book.title}" - Current quantity: ${book.quantity}`);
        
// check if book is available (quantity > 0) 
        if (book.quantity <= 0) {
            return res.status(400).json({ error: 'Book out of stock' });
        }
        
// when purchase is done, decrease quantity 
        const newQuantity = book.quantity - 1;
        await axios.patch(`${CATALOG_URL}/update/${bookId}`, {
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

const PORT = 5000;
app.listen(PORT, () => console.log(`🛒 Order service running on port ${PORT}`));