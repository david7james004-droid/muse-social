const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://museadmin:9753124680musesocial1@muse-social-db.lnhptcr.mongodb.net/?appName=muse-social-db';
const DB_NAME = 'muse-social';
let db;

async function connectDB() {
    try { const client = new MongoClient(MONGO_URI); await client.connect(); db = client.db(DB_NAME); console.log('✅ MongoDB connected!'); return db; }
    catch (err) { console.error('❌ MongoDB error:', err.message); return null; }
}

const uploadDirs = ['public/uploads','public/uploads/images','public/uploads/videos','public/uploads/avatars','public/uploads/stories','public/uploads/messages'];
uploadDirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

app.use(cors()); app.use(express.json()); app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => { let subdir = 'images'; if (file.fieldname === 'video') subdir = 'videos'; if (file.fieldname === 'avatar') subdir = 'avatars'; if (file.fieldname === 'story') subdir = 'stories'; cb(null, path.join(__dirname, 'public/uploads', subdir)); },
    filename: (req, file, cb) => { cb(null, uuidv4() + path.extname(file.originalname)); }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
function col(name) { return db ? db.collection(name) : null; }

// ==================== AUTO REGISTER ====================
app.post('/api/auto-register', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const userData = req.body; let user = await col('users').findOne({ id: userData.id }); if (user) { await col('users').updateOne({ id: userData.id }, { $set: { last_seen: new Date().toISOString(), is_online: 1 } }); return res.json({ success: true, user: { id: user.id, tag_name: user.tag_name, country_flag: user.country_flag || '', avatar: user.avatar || '', bio: user.bio || '', muse_coins: user.muse_coins || 0 } }); } const newUser = { id: userData.id, tag_name: userData.tag_name, password_hash: '', email: '', age: null, country: '', country_flag: userData.country_flag || '', bio: userData.bio || '', avatar: userData.avatar || '', join_date: new Date().toISOString(), last_seen: new Date().toISOString(), muse_coins: 100, is_online: 1, is_live: 0 }; await col('users').insertOne(newUser); res.json({ success: true, user: { id: newUser.id, tag_name: newUser.tag_name, country_flag: newUser.country_flag, avatar: newUser.avatar, bio: newUser.bio, muse_coins: newUser.muse_coins } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== REGISTER ====================
app.post('/api/register', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { tagName, password, email, age, country, countryFlag } = req.body; if (!tagName || tagName.length < 2) return res.json({ success: false, error: 'Tag name too short' }); if (!password || password.length < 4) return res.json({ success: false, error: 'Password too short' }); const exists = await col('users').findOne({ tag_name: tagName }); if (exists) return res.json({ success: false, error: 'Tag name taken' }); const newUser = { id: uuidv4(), tag_name: tagName, password_hash: bcrypt.hashSync(password, 10), email: email || '', age: age || null, country: country || '', country_flag: countryFlag || '', bio: '', avatar: '', join_date: new Date().toISOString(), last_seen: new Date().toISOString(), muse_coins: 100, is_online: 1, is_live: 0 }; await col('users').insertOne(newUser); res.json({ success: true, user: { id: newUser.id, tag_name: newUser.tag_name, country_flag: newUser.country_flag, avatar: newUser.avatar, muse_coins: newUser.muse_coins } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== LOGIN ====================
app.post('/api/login', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { tagName, password } = req.body; const user = await col('users').findOne({ tag_name: tagName }); if (!user) return res.json({ success: false, error: 'User not found' }); if (!bcrypt.compareSync(password, user.password_hash)) return res.json({ success: false, error: 'Invalid password' }); await col('users').updateOne({ id: user.id }, { $set: { is_online: 1, last_seen: new Date().toISOString() } }); res.json({ success: true, user: { id: user.id, tag_name: user.tag_name, country_flag: user.country_flag || '', avatar: user.avatar || '', bio: user.bio || '', muse_coins: user.muse_coins || 0 } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== POSTS ====================
app.get('/api/posts', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { type, userId } = req.query; let query = {}; if (type === 'slideshow') { query.slideshow = true; } else if (type === 'friends' && userId) { const friends = await col('friends').find({ $or: [{ user_id: userId }, { friend_id: userId }], status: 'accepted' }).toArray(); const friendIds = friends.map(f => f.user_id === userId ? f.friend_id : f.user_id); friendIds.push(userId); query.user_id = { $in: friendIds }; } let posts = await col('posts').find(query).sort({ created_at: -1 }).limit(50).toArray(); for (let p of posts) { const u = await col('users').findOne({ id: p.user_id }); p.tag_name = u ? u.tag_name : 'unknown'; p.avatar = u ? u.avatar || '' : ''; p.country_flag = u ? u.country_flag || '' : ''; } res.json({ success: true, posts }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/posts', upload.fields([{ name: 'image', maxCount: 4 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, text, visibility, slideshow } = req.body; if (!userId) return res.json({ success: false, error: 'User ID required' }); let media = '', mediaType = ''; if (req.files) { if (req.files.image && req.files.image.length > 0) { media = req.files.image.map(f => '/uploads/images/' + f.filename).join(','); mediaType = 'image'; } if (req.files.video && req.files.video.length > 0) { media = '/uploads/videos/' + req.files.video[0].filename; mediaType = 'video'; } } const post = { id: uuidv4(), user_id: userId, text: text || '', media, media_type: mediaType, visibility: visibility || 'friends', slideshow: slideshow === 'true' || slideshow === true, created_at: new Date().toISOString(), likes_count: 0, comments_count: 0, shares_count: 0 }; await col('posts').insertOne(post); await col('users').updateOne({ id: userId }, { $inc: { muse_coins: 5 } }); const u = await col('users').findOne({ id: userId }); res.json({ success: true, post: { ...post, tag_name: u ? u.tag_name : 'unknown', avatar: u ? u.avatar || '' : '', country_flag: u ? u.country_flag || '' : '' } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/posts/delete', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, postId } = req.body; const result = await col('posts').deleteOne({ id: postId, user_id: userId }); if (result.deletedCount === 0) return res.json({ success: false, error: 'Post not found or not yours' }); await col('likes').deleteMany({ post_id: postId }); await col('comments').deleteMany({ post_id: postId }); await col('bookmarks').deleteMany({ post_id: postId }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== LIKES & COMMENTS ====================
app.post('/api/like', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, postId } = req.body; const existing = await col('likes').findOne({ user_id: userId, post_id: postId }); if (existing) { await col('likes').deleteOne({ user_id: userId, post_id: postId }); await col('posts').updateOne({ id: postId }, { $inc: { likes_count: -1 } }); return res.json({ success: true, liked: false }); } await col('likes').insertOne({ user_id: userId, post_id: postId, created_at: new Date().toISOString() }); await col('posts').updateOne({ id: postId }, { $inc: { likes_count: 1 } }); const post = await col('posts').findOne({ id: postId }); if (post && post.user_id !== userId) { const liker = await col('users').findOne({ id: userId }); await col('notifications').insertOne({ id: uuidv4(), user_id: post.user_id, from_user_id: userId, type: 'like', post_id: postId, text: (liker ? liker.tag_name : 'Someone') + ' liked your post', is_read: false, created_at: new Date().toISOString() }); } res.json({ success: true, liked: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/comments', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, postId, text } = req.body; if (!text || text.length > 300) return res.json({ success: false, error: 'Invalid comment' }); const comment = { id: uuidv4(), user_id: userId, post_id: postId, text, created_at: new Date().toISOString() }; await col('comments').insertOne(comment); await col('posts').updateOne({ id: postId }, { $inc: { comments_count: 1 } }); const post = await col('posts').findOne({ id: postId }); if (post && post.user_id !== userId) { const commenter = await col('users').findOne({ id: userId }); await col('notifications').insertOne({ id: uuidv4(), user_id: post.user_id, from_user_id: userId, type: 'comment', post_id: postId, text: (commenter ? commenter.tag_name : 'Someone') + ' commented on your post', is_read: false, created_at: new Date().toISOString() }); } const u = await col('users').findOne({ id: userId }); res.json({ success: true, comment: { ...comment, tag_name: u ? u.tag_name : '?', avatar: u ? u.avatar || '' : '' } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/comments/:postId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const comments = await col('comments').find({ post_id: req.params.postId }).sort({ created_at: 1 }).toArray(); for (let c of comments) { const u = await col('users').findOne({ id: c.user_id }); c.tag_name = u ? u.tag_name : '?'; } res.json({ success: true, comments }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== FRIENDS ====================
app.get('/api/friends/:userId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const friends = await col('friends').find({ $or: [{ user_id: req.params.userId }, { friend_id: req.params.userId }], status: 'accepted' }).toArray(); const result = []; for (let f of friends) { const fid = f.user_id === req.params.userId ? f.friend_id : f.user_id; const u = await col('users').findOne({ id: fid }); result.push({ id: fid, tag_name: u ? u.tag_name : '?', avatar: u ? u.avatar || '' : '', country_flag: u ? u.country_flag || '' : '', is_online: u ? u.is_online : 0, friends_since: f.created_at }); } res.json({ success: true, friends: result }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/request', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, friendTagName } = req.body; const friend = await col('users').findOne({ tag_name: friendTagName }); if (!friend) return res.json({ success: false, error: 'User not found' }); if (friend.id === userId) return res.json({ success: false, error: 'Cannot add yourself' }); const exists = await col('friends').findOne({ $or: [{ user_id: userId, friend_id: friend.id }, { user_id: friend.id, friend_id: userId }] }); if (exists) return res.json({ success: false, error: 'Already friends' }); await col('friends').insertOne({ id: uuidv4(), user_id: userId, friend_id: friend.id, status: 'pending', created_at: new Date().toISOString() }); const requester = await col('users').findOne({ id: userId }); await col('notifications').insertOne({ id: uuidv4(), user_id: friend.id, from_user_id: userId, type: 'friend_request', text: (requester ? requester.tag_name : 'Someone') + ' sent you a friend request', is_read: false, created_at: new Date().toISOString() }); res.json({ success: true, message: 'Friend request sent' }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/friends/respond', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, friendId, action } = req.body; if (action === 'accept') await col('friends').updateOne({ user_id: friendId, friend_id: userId, status: 'pending' }, { $set: { status: 'accepted' } }); else await col('friends').deleteOne({ user_id: friendId, friend_id: userId, status: 'pending' }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== MESSAGES ====================
app.get('/api/messages/:userId/:friendId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const msgs = await col('messages').find({ $or: [{ sender_id: req.params.userId, receiver_id: req.params.friendId }, { sender_id: req.params.friendId, receiver_id: req.params.userId }] }).sort({ created_at: 1 }).limit(100).toArray(); for (let m of msgs) { const u = await col('users').findOne({ id: m.sender_id }); m.sender_name = u ? u.tag_name : '?'; } await col('messages').updateMany({ receiver_id: req.params.userId, sender_id: req.params.friendId }, { $set: { is_read: true } }); res.json({ success: true, messages: msgs }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/messages', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { senderId, receiverId, text } = req.body; let media = '', mediaType = ''; if (req.files) { if (req.files.image && req.files.image.length > 0) { media = '/uploads/images/' + req.files.image[0].filename; mediaType = 'image'; } if (req.files.video && req.files.video.length > 0) { media = '/uploads/videos/' + req.files.video[0].filename; mediaType = 'video'; } } const msg = { id: uuidv4(), sender_id: senderId, receiver_id: receiverId, text: text || '', media, media_type: mediaType, is_read: false, created_at: new Date().toISOString() }; await col('messages').insertOne(msg); res.json({ success: true, message: msg }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/conversations/:userId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const userId = req.params.userId; const msgs = await col('messages').find({ $or: [{ sender_id: userId }, { receiver_id: userId }] }).toArray(); const involved = {}; msgs.forEach(m => { if (m.sender_id === userId) involved[m.receiver_id] = true; if (m.receiver_id === userId) involved[m.sender_id] = true; }); const conversations = []; for (let otherId of Object.keys(involved)) { const u = await col('users').findOne({ id: otherId }); const lastMsg = await col('messages').findOne({ $or: [{ sender_id: userId, receiver_id: otherId }, { sender_id: otherId, receiver_id: userId }] }, { sort: { created_at: -1 } }); const unread = await col('messages').countDocuments({ receiver_id: userId, sender_id: otherId, is_read: false }); conversations.push({ other_user_id: otherId, tag_name: u ? u.tag_name : '?', avatar: u ? u.avatar || '' : '', is_online: u ? u.is_online : 0, last_message: lastMsg ? (lastMsg.media ? '📎 Media' : lastMsg.text) : 'Start chatting', unread }); } res.json({ success: true, conversations }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/messages/delete', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, messageId } = req.body; await col('messages').deleteOne({ id: messageId, sender_id: userId }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/messages/delete-conversation', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, friendId } = req.body; await col('messages').deleteMany({ $or: [{ sender_id: userId, receiver_id: friendId }, { sender_id: friendId, receiver_id: userId }] }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== PROFILE ====================
app.get('/api/profile/:userId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const user = await col('users').findOne({ id: req.params.userId }); if (!user) return res.json({ success: false, error: 'User not found' }); const postCount = await col('posts').countDocuments({ user_id: user.id }); const friendCount = await col('friends').countDocuments({ $or: [{ user_id: user.id }, { friend_id: user.id }], status: 'accepted' }); res.json({ success: true, user: { id: user.id, tag_name: user.tag_name, avatar: user.avatar || '', bio: user.bio || '', country_flag: user.country_flag || '', join_date: user.join_date, muse_coins: user.muse_coins || 0 }, stats: { posts: postCount, friends: friendCount } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/profile/update', upload.single('avatar'), async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, bio, tagName, countryFlag } = req.body; const update = {}; if (req.file) update.avatar = '/uploads/avatars/' + req.file.filename; if (bio !== undefined) update.bio = bio; if (tagName) update.tag_name = tagName; if (countryFlag !== undefined) update.country_flag = countryFlag; await col('users').updateOne({ id: userId }, { $set: update }); const user = await col('users').findOne({ id: userId }); res.json({ success: true, user: { id: user.id, tag_name: user.tag_name, avatar: user.avatar || '', bio: user.bio || '', country_flag: user.country_flag || '', muse_coins: user.muse_coins || 0 } }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== NOTIFICATIONS ====================
app.get('/api/notifications/:userId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const notifications = await col('notifications').find({ user_id: req.params.userId }).sort({ created_at: -1 }).limit(50).toArray(); for (let n of notifications) { const u = await col('users').findOne({ id: n.from_user_id }); n.from_tag_name = u ? u.tag_name : ''; } const unread = await col('notifications').countDocuments({ user_id: req.params.userId, is_read: false }); res.json({ success: true, notifications, unread }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/notifications/read', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, notificationId } = req.body; if (notificationId) await col('notifications').updateOne({ id: notificationId, user_id: userId }, { $set: { is_read: true } }); else await col('notifications').updateMany({ user_id: userId }, { $set: { is_read: true } }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== SEARCH, BOOKMARKS, WALLET, STORIES ====================
app.get('/api/search', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const q = (req.query.q || '').toLowerCase(); if (!q) return res.json({ success: true, users: [], posts: [] }); const users = await col('users').find({ tag_name: { $regex: q, $options: 'i' } }).limit(20).toArray(); res.json({ success: true, users: users.map(u => ({ id: u.id, tag_name: u.tag_name, avatar: u.avatar || '', country_flag: u.country_flag || '' })), posts: [] }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/bookmarks', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, postId } = req.body; const existing = await col('bookmarks').findOne({ user_id: userId, post_id: postId }); if (existing) { await col('bookmarks').deleteOne({ user_id: userId, post_id: postId }); return res.json({ success: true, bookmarked: false }); } await col('bookmarks').insertOne({ user_id: userId, post_id: postId, created_at: new Date().toISOString() }); res.json({ success: true, bookmarked: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/wallet/:userId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const user = await col('users').findOne({ id: req.params.userId }); const transactions = await col('wallet_transactions').find({ user_id: req.params.userId }).sort({ created_at: -1 }).limit(50).toArray(); res.json({ success: true, balance: user ? (user.muse_coins || 0) : 0, transactions }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/wallet/send', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { fromUserId, toTagName, amount } = req.body; const amt = parseInt(amount); const sender = await col('users').findOne({ id: fromUserId }); if (!sender || (sender.muse_coins || 0) < amt) return res.json({ success: false, error: 'Insufficient coins' }); const receiver = await col('users').findOne({ tag_name: toTagName }); if (!receiver) return res.json({ success: false, error: 'User not found' }); await col('users').updateOne({ id: fromUserId }, { $inc: { muse_coins: -amt } }); await col('users').updateOne({ id: receiver.id }, { $inc: { muse_coins: amt } }); await col('wallet_transactions').insertOne({ id: uuidv4(), user_id: fromUserId, amount: -amt, type: 'send', description: 'Sent to ' + receiver.tag_name, created_at: new Date().toISOString() }); await col('wallet_transactions').insertOne({ id: uuidv4(), user_id: receiver.id, amount: amt, type: 'receive', description: 'Received from ' + sender.tag_name, created_at: new Date().toISOString() }); res.json({ success: true, newBalance: (sender.muse_coins || 0) - amt }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/stories', upload.single('story'), async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId } = req.body; const story = { id: uuidv4(), user_id: userId, media: '/uploads/stories/' + req.file.filename, media_type: 'image', text: '', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() }; await col('stories').insertOne(story); res.json({ success: true, story }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/stories/:userId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const now = new Date(); const friendIds = [req.params.userId]; const friends = await col('friends').find({ $or: [{ user_id: req.params.userId }, { friend_id: req.params.userId }], status: 'accepted' }).toArray(); friends.forEach(f => friendIds.push(f.user_id === req.params.userId ? f.friend_id : f.user_id)); const stories = await col('stories').find({ user_id: { $in: friendIds }, expires_at: { $gt: now.toISOString() } }).sort({ created_at: -1 }).toArray(); for (let s of stories) { const u = await col('users').findOne({ id: s.user_id }); s.tag_name = u ? u.tag_name : 'unknown'; } res.json({ success: true, stories }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== GROUPS ====================
app.get('/api/groups', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const groups = await col('groups').find({}).sort({ created_at: -1 }).toArray(); for (let g of groups) { const creator = await col('users').findOne({ id: g.creator_id }); g.creator_name = creator ? creator.tag_name : 'unknown'; g.member_count = g.members ? g.members.length : 0; } res.json({ success: true, groups }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/groups', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, name, description } = req.body; const group = { id: uuidv4(), creator_id: userId, name, description: description || '', members: [userId], created_at: new Date().toISOString() }; await col('groups').insertOne(group); res.json({ success: true, group }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/groups/:groupId/messages', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const messages = await col('group_messages').find({ group_id: req.params.groupId }).sort({ created_at: 1 }).limit(100).toArray(); for (let m of messages) { const u = await col('users').findOne({ id: m.sender_id }); m.sender_name = u ? u.tag_name : 'unknown'; } res.json({ success: true, messages }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/groups/:groupId/messages', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, text } = req.body; const msg = { id: uuidv4(), group_id: req.params.groupId, sender_id: userId, text, created_at: new Date().toISOString() }; await col('group_messages').insertOne(msg); res.json({ success: true, message: msg }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/groups/:groupId/leave', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId } = req.body; await col('groups').updateOne({ id: req.params.groupId }, { $pull: { members: userId } }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== EVENTS ====================
app.get('/api/events', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const events = await col('events').find({}).sort({ event_date: 1 }).toArray(); for (let e of events) { const u = await col('users').findOne({ id: e.user_id }); e.tag_name = u ? u.tag_name : 'unknown'; e.attendees = e.attendees || []; } res.json({ success: true, events }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/events', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, title, description, eventDate, location } = req.body; if (!title) return res.json({ success: false, error: 'Title required' }); const event = { id: uuidv4(), user_id: userId, title, description: description || '', event_date: eventDate || new Date().toISOString(), location: location || '', attendees: [userId], created_at: new Date().toISOString() }; await col('events').insertOne(event); res.json({ success: true, event }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/events/:eventId/rsvp', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId } = req.body; const event = await col('events').findOne({ id: req.params.eventId }); if (!event) return res.json({ success: false, error: 'Event not found' }); const attendees = event.attendees || []; const idx = attendees.indexOf(userId); if (idx > -1) { attendees.splice(idx, 1); await col('events').updateOne({ id: req.params.eventId }, { $set: { attendees } }); res.json({ success: true, going: false }); } else { attendees.push(userId); await col('events').updateOne({ id: req.params.eventId }, { $set: { attendees } }); res.json({ success: true, going: true }); } } catch (err) { res.json({ success: false, error: err.message }); }
});

app.delete('/api/events/:eventId', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId } = req.body; const event = await col('events').findOne({ id: req.params.eventId }); if (!event) return res.json({ success: false, error: 'Event not found' }); if (event.user_id !== userId) return res.json({ success: false, error: 'Not your event' }); await col('events').deleteOne({ id: req.params.eventId }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== POLLS ====================
app.get('/api/polls', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const polls = await col('polls').find({}).sort({ created_at: -1 }).limit(30).toArray(); for (let p of polls) { const u = await col('users').findOne({ id: p.user_id }); p.tag_name = u ? u.tag_name : 'unknown'; const votes = await col('poll_votes').find({ poll_id: p.id }).toArray(); const counts = {}; votes.forEach(v => { counts[v.option_index] = (counts[v.option_index] || 0) + 1; }); p.votes = Object.entries(counts).map(e => ({ option_index: parseInt(e[0]), count: e[1] })); } res.json({ success: true, polls }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/polls', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, question, options } = req.body; const poll = { id: uuidv4(), user_id: userId, question, options, created_at: new Date().toISOString() }; await col('polls').insertOne(poll); res.json({ success: true, poll }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/polls/vote', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, pollId, optionIndex } = req.body; const existing = await col('poll_votes').findOne({ user_id: userId, poll_id: pollId }); if (existing) return res.json({ success: false, error: 'Already voted' }); await col('poll_votes').insertOne({ id: uuidv4(), user_id: userId, poll_id: pollId, option_index: optionIndex, created_at: new Date().toISOString() }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== ADMIN ====================
const ADMIN_KEY = process.env.ADMIN_KEY || 'museadmin2026';
function checkAdmin(req, res, next) { const key = req.headers['x-admin-key']; if (key !== ADMIN_KEY) return res.json({ success: false, error: 'Unauthorized' }); next(); }
app.get('/api/admin/users', checkAdmin, async (req, res) => { try { if (!db) return res.json({ success: false, error: 'Database not connected' }); res.json({ success: true, users: await col('users').find({}).toArray() }); } catch (err) { res.json({ success: false, error: err.message }); } });
app.get('/api/admin/posts', checkAdmin, async (req, res) => { try { if (!db) return res.json({ success: false, error: 'Database not connected' }); res.json({ success: true, posts: await col('posts').find({}).sort({ created_at: -1 }).limit(100).toArray() }); } catch (err) { res.json({ success: false, error: err.message }); } });
app.post('/api/admin/user/:userId', checkAdmin, async (req, res) => { try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { action, password } = req.body; if (action === 'block') await col('users').updateOne({ id: req.params.userId }, { $set: { blocked: true } }); else if (action === 'unblock') await col('users').updateOne({ id: req.params.userId }, { $set: { blocked: false } }); else if (action === 'reset_password') await col('users').updateOne({ id: req.params.userId }, { $set: { password_hash: bcrypt.hashSync(password, 10) } }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); } });
app.delete('/api/admin/user/:userId', checkAdmin, async (req, res) => { try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const uid = req.params.userId; await col('posts').deleteMany({ user_id: uid }); await col('likes').deleteMany({ user_id: uid }); await col('comments').deleteMany({ user_id: uid }); await col('friends').deleteMany({ $or: [{ user_id: uid }, { friend_id: uid }] }); await col('messages').deleteMany({ $or: [{ sender_id: uid }, { receiver_id: uid }] }); await col('notifications').deleteMany({ user_id: uid }); await col('users').deleteOne({ id: uid }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); } });
app.delete('/api/admin/posts/:postId', checkAdmin, async (req, res) => { try { if (!db) return res.json({ success: false, error: 'Database not connected' }); await col('posts').deleteOne({ id: req.params.postId }); await col('likes').deleteMany({ post_id: req.params.postId }); await col('comments').deleteMany({ post_id: req.params.postId }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); } });

// ==================== SETTINGS / ACCOUNT ====================
app.post('/api/settings/password', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId, currentPassword, newPassword } = req.body; const user = await col('users').findOne({ id: userId }); if (!user) return res.json({ success: false, error: 'User not found' }); if (!user.password_hash) return res.json({ success: false, error: 'No password set' }); if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.json({ success: false, error: 'Wrong password' }); if (!newPassword || newPassword.length < 4) return res.json({ success: false, error: 'Password too short' }); await col('users').updateOne({ id: userId }, { $set: { password_hash: bcrypt.hashSync(newPassword, 10) } }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

app.post('/api/account/delete', async (req, res) => {
    try { if (!db) return res.json({ success: false, error: 'Database not connected' }); const { userId } = req.body; await col('posts').deleteMany({ user_id: userId }); await col('likes').deleteMany({ user_id: userId }); await col('comments').deleteMany({ user_id: userId }); await col('friends').deleteMany({ $or: [{ user_id: userId }, { friend_id: userId }] }); await col('messages').deleteMany({ $or: [{ sender_id: userId }, { receiver_id: userId }] }); await col('notifications').deleteMany({ user_id: userId }); await col('bookmarks').deleteMany({ user_id: userId }); await col('users').deleteOne({ id: userId }); res.json({ success: true }); } catch (err) { res.json({ success: false, error: err.message }); }
});

// ==================== ROUTING (ALL HTML PAGES) ====================
app.get('/admin.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/index.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/login.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/register.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'register.html')); });
app.get('/centre.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'centre.html')); });
app.get('/profile.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'profile.html')); });
app.get('/friends.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'friends.html')); });
app.get('/messages.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'messages.html')); });
app.get('/notifications.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'notifications.html')); });
app.get('/slideshow.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'slideshow.html')); });
app.get('/hot.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'hot.html')); });
app.get('/wallet.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'wallet.html')); });
app.get('/groups.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'groups.html')); });
app.get('/events.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'events.html')); });
app.get('/polls.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'polls.html')); });
app.get('/stories.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'stories.html')); });
app.get('/search.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'search.html')); });
app.get('/media-uploads.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'media-uploads.html')); });
app.get('/settings.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'settings.html')); });

// Catch-all
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ==================== START SERVER ====================
async function startServer() { await connectDB(); app.listen(PORT, () => { console.log(''); console.log('🎭  MUSE SOCIAL MEDIA SERVER'); console.log('    Port: ' + PORT + ' | MongoDB Atlas'); console.log(''); }); }
startServer();