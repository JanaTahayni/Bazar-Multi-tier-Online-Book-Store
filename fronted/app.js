const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CATALOG = process.env.CATALOG_URL || 'http://localhost:4000';
const ORDER = process.env.ORDER_URL || 'http://localhost:5000';

// search by topic
app.get('/search/:topic', async (req, res) => {
  try {
    const topic = req.params.topic;
    console.log(`🔍 Frontend: Search request for topic: ${topic}`);
    
    const response = await axios.get(`${CATALOG}/search/${encodeURIComponent(topic)}`);
    
    console.log(`✅ Frontend: Search successful, found ${response.data.length} books`);
    res.json(response.data);
    
  } catch (err) {
    console.error('❌ Frontend: Search error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// search by id
app.get('/info/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`ℹ️ Frontend: Info request for book ID: ${id}`);
    
    const response = await axios.get(`${CATALOG}/info/${id}`);
    
    console.log(`✅ Frontend: Info retrieved for: "${response.data.title}"`);
    res.json(response.data);
    
  } catch (err) {
    console.error('❌ Frontend: Info error:', err.message);
    
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// purchase book 
app.post('/purchase/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`🛒 Frontend: Purchase request for book ID: ${id}`);
    
    const response = await axios.post(`${ORDER}/purchase/${id}`);
    
    console.log(`✅ Frontend: Purchase successful - Order ID: ${response.data.order.id}`);
    res.json(response.data);
    
  } catch (err) {
    console.error('❌ Frontend: Purchase error:', err.message);
    
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Bazar Bookstore API',
    endpoints: {
      search: 'GET /search/:topic',
      info: 'GET /info/:id', 
      purchase: 'POST /purchase/:id'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎯 Frontend service running on port ${PORT}`));