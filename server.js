const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { data, initializeDatabase, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directories exist
const uploadDirs = [
    'public/uploads',
    'public/uploads/images',
    'public/uploads/videos',
    'public/uploads/avatars',
    'public/uploads/stories'
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Multer configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let subdir = 'images';
        if (file.fieldname === 'video') subdir = 'videos';
        if (file.fieldname === 'avatar') subdir = 'avatars';
        if (file.fieldname === 'story') subdir = 'stories';
        cb(null, path.join(__dirname, 'public/uploads', subdir));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max
    }
});

// ===================================================================
// AUTO REGISTER (No-login system)
// ===================================================================
app.post('/api/auto-register', function(req, res) {
    try {
        var userData = req.body;
        var existingUser = data.users.find(function(u) { return u.id === userData.id; });
        
        if (existingUser) {
            existingUser.last_seen = new Date().toISOString();
            existingUser.is_online = 1;
            saveDatabase();
            return res.json({
                success: true,
                user: {
                    id: existingUser.id,
                    tag_name: existingUser.tag_name,
                    country_flag: existingUser.country_flag || '',
                    avatar: existingUser.avatar || '',
                    bio: existingUser.bio || '',
                    muse_coins: existingUser.muse_coins || 0
                }
            });
        }
        
        var newUser = {
            id: userData.id,
            tag_name: userData.tag_name,
            password_hash: '',
            age: null,
            country: '',
            country_flag: userData.country_flag || '',
            bio: userData.bio || '',
            avatar: userData.avatar || '',
            join_date: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            muse_coins: 100,
            is_online: 1,
            is_live: 0
        };
        
        data.users.push(newUser);
        
        data.wallet_transactions.push({
            id: uuidv4(),
            user_id: newUser.id,
            amount: 100,
            type: 'bonus',
            description: 'Welcome bonus from Blue Whale Family',
            created_at: new Date().toISOString()
        });
        
        saveDatabase();
        
        res.json({
            success: true,
            user: {
                id: newUser.id,
                tag_name: newUser.tag_name,
                country_flag: newUser.country_flag,
                avatar: newUser.avatar,
                bio: newUser.bio,
                muse_coins: newUser.muse_coins
            }
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===================================================================
// REGISTER (Traditional)
// ===================================================================
app.post('/api/register', function(req, res) {
    try {
        var body = req.body;
        
        if (!body.tagName || body.tagName.length < 2) {
            return res.json({ success: false, error: 'Tag name must be at least 2 characters' });
        }
        if (!body.password || body.password.length < 4) {
            return res.json({ success: false, error: 'Password must be at least 4 characters' });
        }
        
        var exists = data.users.find(function(u) { return u.tag_name === body.tagName; });
        if (exists) {
            return res.json({ success: false, error: 'Tag name already taken' });
        }
        
        var newUser = {
            id: uuidv4(),
            tag_name: body.tagName,
            password_hash: bcrypt.hashSync(body.password, 10),
            age: body.age || null,
            country: body.country || '',
            country_flag: body.countryFlag || '',
            bio: '',
            avatar: '',
            join_date: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            muse_coins: 100,
            is_online: 1,
            is_live: 0
        };
        
        data.users.push(newUser);
        
        data.wallet_transactions.push({
            id: uuidv4(),
            user_id: newUser.id,
            amount: 100,
            type: 'bonus',
            description: 'Welcome bonus',
            created_at: new Date().toISOString()
        });
        
        saveDatabase();
        
        res.json({
            success: true,
            user: {
                id: newUser.id,
                tag_name: newUser.tag_name,
                country_flag: newUser.country_flag,
                avatar: newUser.avatar,
                muse_coins: newUser.muse_coins
            }
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===================================================================
// LOGIN
// ===================================================================
app.post('/api/login', function(req, res) {
    try {
        var body = req.body;
        var user = data.users.find(function(u) { return u.tag_name === body.tagName; });
        
        if (!user) {
            return res.json({ success: false, error: 'User not found' });
        }
        if (!bcrypt.compareSync(body.password, user.password_hash)) {
            return res.json({ success: false, error: 'Invalid password' });
        }
        
        user.is_online = 1;
        user.last_seen = new Date().toISOString();
        saveDatabase();
        
        res.json({
            success: true,
            user: {
                id: user.id,
                tag_name: user.tag_name,
                country_flag: user.country_flag || '',
                avatar: user.avatar || '',
                bio: user.bio || '',
                muse_coins: user.muse_coins || 0
            }
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ===================================================================
// POSTS - GET
// ===================================================================
app.get('/api/posts', function(req, res) {
    var type = req.query.type;
    var userId = req.query.userId;
    
    var posts = data.posts.slice().sort(function(a, b) {
        return new Date(b.created_at) - new Date(a.created_at);
    });
    
    if (type === 'slideshow') {
        posts = posts.filter(function(p) { return p.slideshow === 1 || p.slideshow === true; });
    } else if (type === 'friends' && userId) {
        var friendIds = data.friends
            .filter(function(f) {
                return (f.user_id === userId || f.friend_id === userId) && f.status === 'accepted';
            })
            .map(function(f) {
                return f.user_id === userId ? f.friend_id : f.user_id;
            });
        friendIds.push(userId);
        posts = posts.filter(function(p) { return friendIds.indexOf(p.user_id) !== -1; });
    }
    
    posts = posts.slice(0, 50).map(function(p) {
        var user = data.users.find(function(u) { return u.id === p.user_id; });
        return {
            id: p.id,
            user_id: p.user_id,
            text: p.text || '',
            media: p.media || '',
            media_type: p.media_type || '',
            visibility: p.visibility || 'friends',
            slideshow: p.slideshow || 0,
            created_at: p.created_at,
            likes_count: p.likes_count || 0,
            comments_count: p.comments_count || 0,
            shares_count: p.shares_count || 0,
            is_live: p.is_live || 0,
            tag_name: user ? user.tag_name : 'unknown',
            avatar: user ? user.avatar || '' : '',
            country_flag: user ? user.country_flag || '' : ''
        };
    });
    
    res.json({ success: true, posts: posts });
});

// ===================================================================
// POSTS - CREATE
// ===================================================================
app.post('/api/posts', upload.fields([
    { name: 'image', maxCount: 4 },
    { name: 'video', maxCount: 1 }
]), function(req, res) {
    try {
        var userId = req.body.userId;
        var text = req.body.text || '';
        var visibility = req.body.visibility || 'friends';
        var slideshow = req.body.slideshow === 'true' || req.body.slideshow === true;
        
        if (!userId) {
            return res.json({ success: false, error: 'User ID required' });
        }
        
        var media = '';
        var mediaType = '';
        
        if (req.files) {
            if (req.files.image && req.files.image.length > 0) {
                media = req.files.image.map(function(f) {
                    return '/uploads/images/' + f.filename;
                }).join(',');
                mediaType = 'image';
            }
            if (req.files.video && req.files.video.length > 0) {
                media = '/uploads/videos/' + req.files.video[0].filename;
                mediaType = 'video';
            }
        }
        
        if (!text && !media) {
            return res.json({ success: false, error: 'Add text or media' });
        }
        
        var post = {
            id: uuidv4(),
            user_id: userId,
            text: text,
            media: media,
            media_type: mediaType,
            visibility: visibility,
            slideshow: slideshow ? 1 : 0,
            created_at: new Date().toISOString(),
            likes_count: 0,
            comments_count: 0,
            shares_count: 0,
            is_live: 0
        };
        
        data.posts.push(post);
        
        var user = data.users.find(function(u) { return u.id === userId; });
        if (user) {
            user.muse_coins = (user.muse_coins || 0) + 5;
        }
        
        data.wallet_transactions.push({
            id: uuidv4(),
            user_id: userId,
            amount: 5,
            type: 'earn',
            description: 'Posted content',
            created_at: new Date().toISOString()
        });
        
        saveDatabase();
        
        var userInfo = data.users.find(function(u) { return u.id === userId; });
        
        res.json({
            success: true,
            post: {
                id: post.id,
                user_id: post.user_id,
                text: post.text,
                media: post.media,
                media_type: post.media_type,
                visibility: post.visibility,
                slideshow: post.slideshow,
                created_at: post.created_at,
                likes_count: post.likes_count,
                comments_count: post.comments_count,
                shares_count: post.shares_count,
                tag_name: userInfo ? userInfo.tag_name : 'unknown',
                avatar: userInfo ? userInfo.avatar || '' : '',
                country_flag: userInfo ? userInfo.country_flag || '' : ''
            }
        });
    } catch (err) {
        console.error('Post error:', err);
        res.json({ success: false, error: err.message });
    }
});

// ===================================================================
// POSTS - DELETE
// ===================================================================
app.post('/api/posts/delete', function(req, res) {
    var userId = req.body.userId;
    var postId = req.body.postId;
    
    var postIndex = data.posts.findIndex(function(p) {
        return p.id === postId && p.user_id === userId;
    });
    
    if (postIndex === -1) {
        return res.json({ success: false, error: 'Post not found or not yours' });
    }
    
    data.likes = data.likes.filter(function(l) { return l.post_id !== postId; });
    data.comments = data.comments.filter(function(c) { return c.post_id !== postId; });
    data.bookmarks = data.bookmarks.filter(function(b) { return b.post_id !== postId; });
    data.posts.splice(postIndex, 1);
    
    saveDatabase();
    res.json({ success: true });
});

// ===================================================================
// LIKES
// ===================================================================
app.post('/api/like', function(req, res) {
    var userId = req.body.userId;
    var postId = req.body.postId;
    
    var existingLike = data.likes.find(function(l) {
        return l.user_id === userId && l.post_id === postId;
    });
    
    if (existingLike) {
        data.likes = data.likes.filter(function(l) {
            return !(l.user_id === userId && l.post_id === postId);
        });
        var post = data.posts.find(function(p) { return p.id === postId; });
        if (post) {
            post.likes_count = Math.max(0, (post.likes_count || 0) - 1);
        }
        saveDatabase();
        return res.json({ success: true, liked: false });
    }
    
    data.likes.push({
        id: uuidv4(),
        user_id: userId,
        post_id: postId,
        created_at: new Date().toISOString()
    });
    
    var post = data.posts.find(function(p) { return p.id === postId; });
    if (post) {
        post.likes_count = (post.likes_count || 0) + 1;
        
        if (post.user_id !== userId) {
            var liker = data.users.find(function(u) { return u.id === userId; });
            data.notifications.push({
                id: uuidv4(),
                user_id: post.user_id,
                from_user_id: userId,
                type: 'like',
                post_id: postId,
                text: (liker ? liker.tag_name : 'Someone') + ' liked your post',
                is_read: 0,
                created_at: new Date().toISOString()
            });
        }
    }
    
    saveDatabase();
    res.json({ success: true, liked: true });
});

// ===================================================================
// COMMENTS
// ===================================================================
app.post('/api/comments', function(req, res) {
    var userId = req.body.userId;
    var postId = req.body.postId;
    var text = req.body.text;
    
    if (!text || text.length > 300) {
        return res.json({ success: false, error: 'Invalid comment' });
    }
    
    var comment = {
        id: uuidv4(),
        user_id: userId,
        post_id: postId,
        text: text,
        created_at: new Date().toISOString()
    };
    
    data.comments.push(comment);
    
    var post = data.posts.find(function(p) { return p.id === postId; });
    if (post) {
        post.comments_count = (post.comments_count || 0) + 1;
    }
    
    saveDatabase();
    
    var user = data.users.find(function(u) { return u.id === userId; });
    
    res.json({
        success: true,
        comment: {
            id: comment.id,
            user_id: comment.user_id,
            post_id: comment.post_id,
            text: comment.text,
            created_at: comment.created_at,
            tag_name: user ? user.tag_name : '?',
            avatar: user ? user.avatar || '' : ''
        }
    });
});

app.get('/api/comments/:postId', function(req, res) {
    var postId = req.params.postId;
    
    var comments = data.comments
        .filter(function(c) { return c.post_id === postId; })
        .sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); })
        .map(function(c) {
            var user = data.users.find(function(u) { return u.id === c.user_id; });
            return {
                id: c.id,
                user_id: c.user_id,
                post_id: c.post_id,
                text: c.text,
                created_at: c.created_at,
                tag_name: user ? user.tag_name : '?',
                avatar: user ? user.avatar || '' : ''
            };
        });
    
    res.json({ success: true, comments: comments });
});

// ===================================================================
// FRIENDS
// ===================================================================
app.get('/api/friends/:userId', function(req, res) {
    var userId = req.params.userId;
    
    var friends = data.friends
        .filter(function(f) {
            return (f.user_id === userId || f.friend_id === userId) && f.status === 'accepted';
        })
        .map(function(f) {
            var friendId = f.user_id === userId ? f.friend_id : f.user_id;
            var friend = data.users.find(function(u) { return u.id === friendId; });
            return {
                id: friendId,
                tag_name: friend ? friend.tag_name : '?',
                avatar: friend ? friend.avatar || '' : '',
                country_flag: friend ? friend.country_flag || '' : '',
                is_online: friend ? friend.is_online : 0,
                friends_since: f.created_at
            };
        });
    
    res.json({ success: true, friends: friends });
});

app.post('/api/friends/request', function(req, res) {
    var userId = req.body.userId;
    var friendTagName = req.body.friendTagName;
    
    var friend = data.users.find(function(u) { return u.tag_name === friendTagName; });
    
    if (!friend) {
        return res.json({ success: false, error: 'User not found' });
    }
    if (friend.id === userId) {
        return res.json({ success: false, error: 'Cannot add yourself' });
    }
    
    var exists = data.friends.find(function(f) {
        return (f.user_id === userId && f.friend_id === friend.id) ||
               (f.user_id === friend.id && f.friend_id === userId);
    });
    
    if (exists) {
        return res.json({ success: false, error: 'Already friends or request pending' });
    }
    
    data.friends.push({
        id: uuidv4(),
        user_id: userId,
        friend_id: friend.id,
        status: 'pending',
        created_at: new Date().toISOString()
    });
    
    var requester = data.users.find(function(u) { return u.id === userId; });
    data.notifications.push({
        id: uuidv4(),
        user_id: friend.id,
        from_user_id: userId,
        type: 'friend_request',
        text: (requester ? requester.tag_name : 'Someone') + ' sent you a friend request',
        is_read: 0,
        created_at: new Date().toISOString()
    });
    
    saveDatabase();
    res.json({ success: true, message: 'Friend request sent' });
});

app.post('/api/friends/respond', function(req, res) {
    var userId = req.body.userId;
    var friendId = req.body.friendId;
    var action = req.body.action;
    
    var friendReq = data.friends.find(function(f) {
        return f.user_id === friendId && f.friend_id === userId && f.status === 'pending';
    });
    
    if (!friendReq) {
        // Try to find any existing friendship for removal
        var anyFriend = data.friends.find(function(f) {
            return (f.user_id === userId && f.friend_id === friendId) ||
                   (f.user_id === friendId && f.friend_id === userId);
        });
        
        if (anyFriend && action === 'reject') {
            data.friends = data.friends.filter(function(f) {
                return f.id !== anyFriend.id;
            });
            saveDatabase();
            return res.json({ success: true });
        }
        
        return res.json({ success: false, error: 'Request not found' });
    }
    
    if (action === 'accept') {
        friendReq.status = 'accepted';
    } else {
        data.friends = data.friends.filter(function(f) {
            return f.id !== friendReq.id;
        });
    }
    
    saveDatabase();
    res.json({ success: true });
});

// ===================================================================
// MESSAGES
// ===================================================================
app.get('/api/messages/:userId/:friendId', function(req, res) {
    var userId = req.params.userId;
    var friendId = req.params.friendId;
    
    var msgs = data.messages
        .filter(function(m) {
            return (m.sender_id === userId && m.receiver_id === friendId) ||
                   (m.sender_id === friendId && m.receiver_id === userId);
        })
        .sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); })
        .slice(0, 100)
        .map(function(m) {
            var sender = data.users.find(function(u) { return u.id === m.sender_id; });
            return {
                id: m.id,
                sender_id: m.sender_id,
                receiver_id: m.receiver_id,
                text: m.text,
                is_read: m.is_read,
                created_at: m.created_at,
                sender_name: sender ? sender.tag_name : '?',
                sender_avatar: sender ? sender.avatar || '' : ''
            };
        });
    
    // Mark as read
    data.messages.forEach(function(m) {
        if (m.receiver_id === userId && m.sender_id === friendId) {
            m.is_read = 1;
        }
    });
    saveDatabase();
    
    res.json({ success: true, messages: msgs });
});

app.post('/api/messages', function(req, res) {
    var senderId = req.body.senderId;
    var receiverId = req.body.receiverId;
    var text = req.body.text;
    
    var msg = {
        id: uuidv4(),
        sender_id: senderId,
        receiver_id: receiverId,
        text: text,
        is_read: 0,
        created_at: new Date().toISOString()
    };
    
    data.messages.push(msg);
    saveDatabase();
    
    var sender = data.users.find(function(u) { return u.id === senderId; });
    
    res.json({
        success: true,
        message: {
            id: msg.id,
            sender_id: msg.sender_id,
            receiver_id: msg.receiver_id,
            text: msg.text,
            is_read: msg.is_read,
            created_at: msg.created_at,
            sender_name: sender ? sender.tag_name : '?'
        }
    });
});

app.get('/api/conversations/:userId', function(req, res) {
    var userId = req.params.userId;
    var involved = {};
    
    data.messages.forEach(function(m) {
        if (m.sender_id === userId) {
            involved[m.receiver_id] = true;
        }
        if (m.receiver_id === userId) {
            involved[m.sender_id] = true;
        }
    });
    
    var conversations = Object.keys(involved).map(function(otherId) {
        var user = data.users.find(function(u) { return u.id === otherId; });
        
        var allMsgs = data.messages
            .filter(function(m) {
                return (m.sender_id === userId && m.receiver_id === otherId) ||
                       (m.sender_id === otherId && m.receiver_id === userId);
            })
            .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        
        var lastMsg = allMsgs[0];
        var unread = data.messages.filter(function(m) {
            return m.receiver_id === userId && m.sender_id === otherId && !m.is_read;
        }).length;
        
        return {
            other_user_id: otherId,
            tag_name: user ? user.tag_name : '?',
            avatar: user ? user.avatar || '' : '',
            is_online: user ? user.is_online : 0,
            last_message: lastMsg ? lastMsg.text : 'Start chatting',
            unread: unread
        };
    }).sort(function(a, b) {
        var aMsgs = data.messages.filter(function(m) {
            return (m.sender_id === userId && m.receiver_id === a.other_user_id) ||
                   (m.sender_id === a.other_user_id && m.receiver_id === userId);
        }).sort(function(x, y) { return new Date(y.created_at) - new Date(x.created_at); });
        
        var bMsgs = data.messages.filter(function(m) {
            return (m.sender_id === userId && m.receiver_id === b.other_user_id) ||
                   (m.sender_id === b.other_user_id && m.receiver_id === userId);
        }).sort(function(x, y) { return new Date(y.created_at) - new Date(x.created_at); });
        
        if (!aMsgs[0]) return 1;
        if (!bMsgs[0]) return -1;
        return new Date(bMsgs[0].created_at) - new Date(aMsgs[0].created_at);
    });
    
    res.json({ success: true, conversations: conversations });
});

// ===================================================================
// PROFILE
// ===================================================================
app.get('/api/profile/:userId', function(req, res) {
    var user = data.users.find(function(u) { return u.id === req.params.userId; });
    if (!user) {
        return res.json({ success: false, error: 'User not found' });
    }
    
    var postCount = data.posts.filter(function(p) { return p.user_id === user.id; }).length;
    var friendCount = data.friends.filter(function(f) {
        return (f.user_id === user.id || f.friend_id === user.id) && f.status === 'accepted';
    }).length;
    
    res.json({
        success: true,
        user: {
            id: user.id,
            tag_name: user.tag_name,
            avatar: user.avatar || '',
            cover: user.cover || '',
            bio: user.bio || '',
            age: user.age,
            country: user.country || '',
            country_flag: user.country_flag || '',
            join_date: user.join_date,
            muse_coins: user.muse_coins || 0,
            is_online: user.is_online,
            is_live: user.is_live
        },
        stats: {
            posts: postCount,
            friends: friendCount
        }
    });
});

app.post('/api/profile/update', upload.single('avatar'), function(req, res) {
    var userId = req.body.userId;
    var bio = req.body.bio;
    var tagName = req.body.tagName;
    var countryFlag = req.body.countryFlag;
    
    var user = data.users.find(function(u) { return u.id === userId; });
    if (!user) {
        return res.json({ success: false, error: 'User not found' });
    }
    
    if (req.file) {
        user.avatar = '/uploads/avatars/' + req.file.filename;
    }
    if (bio !== undefined && bio !== null) {
        user.bio = bio;
    }
    if (tagName) {
        user.tag_name = tagName;
    }
    if (countryFlag !== undefined) {
        user.country_flag = countryFlag;
    }
    
    saveDatabase();
    
    res.json({
        success: true,
        user: {
            id: user.id,
            tag_name: user.tag_name,
            avatar: user.avatar || '',
            bio: user.bio || '',
            country_flag: user.country_flag || '',
            muse_coins: user.muse_coins || 0
        }
    });
});

// ===================================================================
// SETTINGS - PASSWORD
// ===================================================================
app.post('/api/settings/password', function(req, res) {
    var userId = req.body.userId;
    var currentPassword = req.body.currentPassword;
    var newPassword = req.body.newPassword;
    
    var user = data.users.find(function(u) { return u.id === userId; });
    if (!user) {
        return res.json({ success: false, error: 'User not found' });
    }
    if (!user.password_hash) {
        return res.json({ success: false, error: 'No password set for auto-generated accounts' });
    }
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.json({ success: false, error: 'Current password is incorrect' });
    }
    if (!newPassword || newPassword.length < 4) {
        return res.json({ success: false, error: 'New password must be at least 4 characters' });
    }
    
    user.password_hash = bcrypt.hashSync(newPassword, 10);
    saveDatabase();
    res.json({ success: true });
});

// ===================================================================
// ACCOUNT - DELETE
// ===================================================================
app.post('/api/account/delete', function(req, res) {
    var userId = req.body.userId;
    
    var userIndex = data.users.findIndex(function(u) { return u.id === userId; });
    if (userIndex === -1) {
        return res.json({ success: false, error: 'User not found' });
    }
    
    data.posts = data.posts.filter(function(p) { return p.user_id !== userId; });
    data.likes = data.likes.filter(function(l) { return l.user_id !== userId; });
    data.comments = data.comments.filter(function(c) { return c.user_id !== userId; });
    data.friends = data.friends.filter(function(f) { return f.user_id !== userId && f.friend_id !== userId; });
    data.messages = data.messages.filter(function(m) { return m.sender_id !== userId && m.receiver_id !== userId; });
    data.notifications = data.notifications.filter(function(n) { return n.user_id !== userId; });
    data.stories = data.stories.filter(function(s) { return s.user_id !== userId; });
    data.bookmarks = data.bookmarks.filter(function(b) { return b.user_id !== userId; });
    data.wallet_transactions = data.wallet_transactions.filter(function(t) { return t.user_id !== userId; });
    data.users.splice(userIndex, 1);
    
    saveDatabase();
    res.json({ success: true });
});

// ===================================================================
// SEARCH
// ===================================================================
app.get('/api/search', function(req, res) {
    var q = (req.query.q || '').toLowerCase();
    
    if (!q) {
        return res.json({ success: true, users: [], posts: [] });
    }
    
    var users = data.users
        .filter(function(u) { return u.tag_name.toLowerCase().indexOf(q) !== -1; })
        .slice(0, 20)
        .map(function(u) {
            return {
                id: u.id,
                tag_name: u.tag_name,
                avatar: u.avatar || '',
                country_flag: u.country_flag || ''
            };
        });
    
    var posts = data.posts
        .filter(function(p) { return (p.text || '').toLowerCase().indexOf(q) !== -1; })
        .slice(0, 20)
        .map(function(p) {
            var user = data.users.find(function(u) { return u.id === p.user_id; });
            return {
                id: p.id,
                user_id: p.user_id,
                text: p.text,
                media: p.media,
                media_type: p.media_type,
                created_at: p.created_at,
                likes_count: p.likes_count || 0,
                comments_count: p.comments_count || 0,
                tag_name: user ? user.tag_name : '?',
                avatar: user ? user.avatar || '' : ''
            };
        });
    
    res.json({ success: true, users: users, posts: posts });
});

// ===================================================================
// BOOKMARKS
// ===================================================================
app.post('/api/bookmarks', function(req, res) {
    var userId = req.body.userId;
    var postId = req.body.postId;
    
    var existing = data.bookmarks.find(function(b) {
        return b.user_id === userId && b.post_id === postId;
    });
    
    if (existing) {
        data.bookmarks = data.bookmarks.filter(function(b) {
            return !(b.user_id === userId && b.post_id === postId);
        });
        saveDatabase();
        return res.json({ success: true, bookmarked: false });
    }
    
    data.bookmarks.push({
        id: uuidv4(),
        user_id: userId,
        post_id: postId,
        created_at: new Date().toISOString()
    });
    
    saveDatabase();
    res.json({ success: true, bookmarked: true });
});

app.get('/api/bookmarks/:userId', function(req, res) {
    var userId = req.params.userId;
    
    var bookmarks = data.bookmarks
        .filter(function(b) { return b.user_id === userId; })
        .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); })
        .map(function(b) {
            var post = data.posts.find(function(p) { return p.id === b.post_id; });
            if (!post) return null;
            var user = data.users.find(function(u) { return u.id === post.user_id; });
            return {
                id: post.id,
                user_id: post.user_id,
                text: post.text,
                media: post.media,
                media_type: post.media_type,
                created_at: post.created_at,
                likes_count: post.likes_count || 0,
                comments_count: post.comments_count || 0,
                tag_name: user ? user.tag_name : '?',
                avatar: user ? user.avatar || '' : '',
                bookmarked_at: b.created_at
            };
        })
        .filter(function(b) { return b !== null; });
    
    res.json({ success: true, bookmarks: bookmarks });
});

// ===================================================================
// NOTIFICATIONS
// ===================================================================
app.get('/api/notifications/:userId', function(req, res) {
    var userId = req.params.userId;
    
    var notifications = data.notifications
        .filter(function(n) { return n.user_id === userId; })
        .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); })
        .slice(0, 50)
        .map(function(n) {
            var fromUser = data.users.find(function(u) { return u.id === n.from_user_id; });
            return {
                id: n.id,
                user_id: n.user_id,
                from_user_id: n.from_user_id,
                type: n.type,
                post_id: n.post_id,
                text: n.text,
                is_read: n.is_read,
                created_at: n.created_at,
                from_tag_name: fromUser ? fromUser.tag_name : '',
                from_avatar: fromUser ? fromUser.avatar || '' : ''
            };
        });
    
    var unread = data.notifications.filter(function(n) {
        return n.user_id === userId && !n.is_read;
    }).length;
    
    res.json({ success: true, notifications: notifications, unread: unread });
});

app.post('/api/notifications/read', function(req, res) {
    var userId = req.body.userId;
    var notificationId = req.body.notificationId;
    
    if (notificationId) {
        var n = data.notifications.find(function(n) {
            return n.id === notificationId && n.user_id === userId;
        });
        if (n) n.is_read = 1;
    } else {
        data.notifications.forEach(function(n) {
            if (n.user_id === userId) n.is_read = 1;
        });
    }
    
    saveDatabase();
    res.json({ success: true });
});

// ===================================================================
// WALLET
// ===================================================================
app.get('/api/wallet/:userId', function(req, res) {
    var userId = req.params.userId;
    var user = data.users.find(function(u) { return u.id === userId; });
    
    var transactions = data.wallet_transactions
        .filter(function(t) { return t.user_id === userId; })
        .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); })
        .slice(0, 50);
    
    res.json({
        success: true,
        balance: user ? (user.muse_coins || 0) : 0,
        transactions: transactions
    });
});

app.post('/api/wallet/send', function(req, res) {
    var fromUserId = req.body.fromUserId;
    var toTagName = req.body.toTagName;
    var amount = parseInt(req.body.amount);
    
    var sender = data.users.find(function(u) { return u.id === fromUserId; });
    if (!sender || (sender.muse_coins || 0) < amount) {
        return res.json({ success: false, error: 'Insufficient coins' });
    }
    
    var receiver = data.users.find(function(u) { return u.tag_name === toTagName; });
    if (!receiver) {
        return res.json({ success: false, error: 'User not found' });
    }
    
    sender.muse_coins -= amount;
    receiver.muse_coins = (receiver.muse_coins || 0) + amount;
    
    data.wallet_transactions.push({
        id: uuidv4(),
        user_id: fromUserId,
        amount: -amount,
        type: 'send',
        description: 'Sent to ' + receiver.tag_name,
        created_at: new Date().toISOString()
    });
    
    data.wallet_transactions.push({
        id: uuidv4(),
        user_id: receiver.id,
        amount: amount,
        type: 'receive',
        description: 'Received from ' + sender.tag_name,
        created_at: new Date().toISOString()
    });
    
    saveDatabase();
    res.json({ success: true, newBalance: sender.muse_coins });
});

// ===================================================================
// STORIES
// ===================================================================
app.post('/api/stories', upload.single('story'), function(req, res) {
    var userId = req.body.userId;
    
    var story = {
        id: uuidv4(),
        user_id: userId,
        media: '/uploads/stories/' + req.file.filename,
        media_type: 'image',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    data.stories.push(story);
    saveDatabase();
    res.json({ success: true, story: story });
});

app.get('/api/stories/:userId', function(req, res) {
    var userId = req.params.userId;
    var now = new Date();
    
    var friendIds = data.friends
        .filter(function(f) {
            return (f.user_id === userId || f.friend_id === userId) && f.status === 'accepted';
        })
        .map(function(f) {
            return f.user_id === userId ? f.friend_id : f.user_id;
        });
    friendIds.push(userId);
    
    var stories = data.stories
        .filter(function(s) {
            return friendIds.indexOf(s.user_id) !== -1 && new Date(s.expires_at) > now;
        })
        .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); })
        .map(function(s) {
            var user = data.users.find(function(u) { return u.id === s.user_id; });
            return {
                id: s.id,
                user_id: s.user_id,
                media: s.media,
                media_type: s.media_type,
                created_at: s.created_at,
                expires_at: s.expires_at,
                tag_name: user ? user.tag_name : '?',
                avatar: user ? user.avatar || '' : ''
            };
        });
    
    res.json({ success: true, stories: stories });
});

// ===================================================================
// GAMES
// ===================================================================
app.post('/api/games/score', function(req, res) {
    var userId = req.body.userId;
    var score = req.body.score || 0;
    var reward = Math.floor(score / 10);
    
    var user = data.users.find(function(u) { return u.id === userId; });
    if (user) {
        user.muse_coins = (user.muse_coins || 0) + reward;
    }
    
    saveDatabase();
    res.json({
        success: true,
        reward: reward,
        newBalance: user ? user.muse_coins : 0
    });
});

// ===================================================================
// START SERVER
// ===================================================================
initializeDatabase();

app.listen(PORT, function() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║                                              ║');
    console.log('║     🎭  MUSE SOCIAL MEDIA SERVER  🎭        ║');
    console.log('║     Amusement Inc. - 24/7                    ║');
    console.log('║     Sponsored by The Blue Whale Family       ║');
    console.log('║                                              ║');
    console.log('║     Local: http://localhost:' + PORT + '              ║');
    console.log('║                                              ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
});