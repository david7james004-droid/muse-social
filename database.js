const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './muse.db.json';

let data = {
    users: [],
    posts: [],
    likes: [],
    comments: [],
    friends: [],
    messages: [],
    notifications: [],
    stories: [],
    polls: [],
    poll_votes: [],
    bookmarks: [],
    market_listings: [],
    groups: [],
    group_members: [],
    events: [],
    wallet_transactions: []
};

function initializeDatabase() {
    console.log('Database: Initializing...');
    
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir) && dir !== '.') {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    if (fs.existsSync(DB_PATH)) {
        try {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            const loaded = JSON.parse(raw);
            Object.keys(data).forEach(key => {
                if (loaded[key] && Array.isArray(loaded[key])) {
                    data[key] = loaded[key];
                }
            });
            console.log('Database: Loaded existing data (' + data.users.length + ' users)');
        } catch (err) {
            console.log('Database: Could not load, starting fresh');
            saveDatabase();
        }
    } else {
        console.log('Database: Created new database');
        saveDatabase();
    }
    
    return data;
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Database: Save error:', err.message);
    }
}

module.exports = { data, initializeDatabase, saveDatabase };