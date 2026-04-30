require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- JWT Middleware ---
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

const DATA_DIR = path.join(__dirname, 'data');
const VENUES_FILE = path.join(DATA_DIR, 'venues.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Init files
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(VENUES_FILE)) fs.writeFileSync(VENUES_FILE, JSON.stringify([]));
if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, JSON.stringify([]));
if (!fs.existsSync(REGISTRATIONS_FILE)) fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify([]));
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const readJson = (file) => new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => err ? reject(err) : resolve(JSON.parse(data)));
});
const writeJson = (file, data) => new Promise((resolve, reject) => {
    fs.writeFile(file, JSON.stringify(data, null, 2), err => err ? reject(err) : resolve());
});

// --- AUTH API ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { role, name, password } = req.body;
        const email = req.body.email ? req.body.email.toLowerCase() : null;
        if (!role || !name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
        
        if (role !== 'user' && role !== 'organizer') {
            return res.status(400).json({ error: 'Invalid role provided' });
        }

        const users = await readJson(USERS_FILE);
        if (users.some(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: crypto.randomUUID(),
            role, // 'user' or 'organizer'
            name,
            email,
            password: hashedPassword,
            status: role === 'organizer' ? 'pending' : 'active'
        };

        users.push(newUser);
        await writeJson(USERS_FILE, users);
        
        // Don't send password back
        const { password: _, ...userSafe } = newUser;
        res.status(201).json({ message: 'Registration successful', user: userSafe });
    } catch (e) { res.status(500).json({ error: 'Failed to register' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { role, password } = req.body;
        const email = req.body.email ? req.body.email.toLowerCase() : null;
        
        // Admin hardcoded logic
        if (role === 'admin') {
            if (password === '12345678') {
                const token = jwt.sign({ id: 'admin', role: 'admin' }, JWT_SECRET);
                return res.json({ id: 'admin', role: 'admin', name: 'System Admin', status: 'active', token });
            }
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        // Standard user/organizer logic
        const users = await readJson(USERS_FILE);
        const user = users.find(u => u.email === email && u.role === role);
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email, password, or role' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Account pending Admin verification. Please wait.' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
        const { password: _, ...userSafe } = user;
        userSafe.token = token;
        res.json(userSafe);
    } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

// --- ADMIN VERIFICATION API ---
app.get('/api/admin/organizers', async (req, res) => {
    try {
        const users = await readJson(USERS_FILE);
        const organizers = users.filter(u => u.role === 'organizer');
        // don't send passwords
        res.json(organizers.map(({ password, ...u }) => u));
    } catch (e) { res.status(500).json({ error: 'Failed to read organizers' }); }
});

app.post('/api/admin/organizers/:id/verify', async (req, res) => {
    try {
        const users = await readJson(USERS_FILE);
        const idx = users.findIndex(u => u.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'User not found' });
        
        users[idx].status = 'active';
        await writeJson(USERS_FILE, users);
        
        res.json({ message: 'Organizer verified successfully' });
    } catch (e) { res.status(500).json({ error: 'Failed to verify organizer' }); }
});

app.get('/api/admin/users', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        const users = await readJson(USERS_FILE);
        const safeUsers = users.map(({ password, ...u }) => u);
        res.json(safeUsers);
    } catch (e) { res.status(500).json({ error: 'Failed to read users' }); }
});

// --- VENUES API (Admin) ---
app.get('/api/venues', async (req, res) => {
    try { res.json(await readJson(VENUES_FILE)); } 
    catch (e) { res.status(500).json({ error: 'Failed to read venues' }); }
});

app.post('/api/venues', async (req, res) => {
    try {
        const { name, type, capacity } = req.body;
        if (!name || !type || !capacity) return res.status(400).json({ error: 'Missing fields' });
        
        const venues = await readJson(VENUES_FILE);
        const newVenue = { id: Date.now().toString(), name, type, capacity: parseInt(capacity) };
        venues.push(newVenue);
        await writeJson(VENUES_FILE, venues);
        res.status(201).json(newVenue);
    } catch (e) { res.status(500).json({ error: 'Failed to create venue' }); }
});

app.delete('/api/venues/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        const venues = await readJson(VENUES_FILE);
        const newVenues = venues.filter(v => v.id !== req.params.id);
        if (venues.length === newVenues.length) return res.status(404).json({ error: 'Venue not found' });
        await writeJson(VENUES_FILE, newVenues);
        res.json({ message: 'Venue deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete venue' }); }
});

// --- EVENTS API (Organizer) ---
app.get('/api/events', async (req, res) => {
    try {
        const events = await readJson(EVENTS_FILE);
        const venues = await readJson(VENUES_FILE);
        const registrations = await readJson(REGISTRATIONS_FILE);
        
        const now = new Date();

        const enrichedEvents = events.map(ev => {
            // Handle both legacy venueId and new venueIds array
            const vIds = ev.venueIds ? ev.venueIds : (ev.venueId ? [ev.venueId] : []);
            const evVenues = vIds.map(vid => venues.find(v => v.id === vid) || { name: 'Unknown', type: 'Unknown', capacity: 0 });
            
            const totalCapacity = evVenues.reduce((sum, v) => sum + v.capacity, 0);
            const venueNames = evVenues.map(v => v.name).join(', ') || 'No Venue Assigned';
            const venueTypes = [...new Set(evVenues.map(v => v.type))].join(', ') || 'Unknown';
            const bookedSeats = registrations.filter(r => r.eventId === ev.id).length;
            
            return { 
                ...ev, 
                venueIds: vIds,
                venueName: venueNames, 
                venueType: venueTypes, 
                capacity: totalCapacity,
                bookedSeats,
                venuesList: evVenues
            };
        });

        if (req.query.type === 'upcoming') {
            const upcoming = enrichedEvents.filter(ev => {
                const dur = ev.duration ? parseFloat(ev.duration) : 2;
                const eventDateTime = new Date(`${ev.date}T${ev.time}`);
                eventDateTime.setMinutes(eventDateTime.getMinutes() + (dur * 60));
                return eventDateTime >= now;
            }).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
            return res.json(upcoming);
        }
        res.json(enrichedEvents);
    } catch (e) { res.status(500).json({ error: 'Failed to read events' }); }
});

app.post('/api/events', verifyToken, async (req, res) => {
    if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Only organizers can create events' });
    try {
        const { title, venueIds, date, time, duration, description, imageBase64, organizerId, eventType, teamSize } = req.body;
        if (!title || !venueIds || !Array.isArray(venueIds) || venueIds.length === 0 || !date || !time || !duration || !organizerId) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const eventDateTime = new Date(`${date}T${time}`);
        if (eventDateTime < new Date()) return res.status(400).json({ error: 'Cannot create events in the past.' });

        const events = await readJson(EVENTS_FILE);
        
        // Duration overlap conflict detection for ALL selected venues
        const [newH, newM] = time.split(':').map(Number);
        const newStart = (newH * 60) + newM;
        const newEnd = newStart + (parseFloat(duration) * 60);

        for (let vid of venueIds) {
            const venueEventsOnDate = events.filter(e => {
                const vIds = e.venueIds ? e.venueIds : (e.venueId ? [e.venueId] : []);
                return vIds.includes(vid) && e.date === date;
            });
            for (let ev of venueEventsOnDate) {
                const evDur = ev.duration ? parseFloat(ev.duration) : 2; // fallback to 2 hrs
                const [evH, evM] = ev.time.split(':').map(Number);
                const evStart = (evH * 60) + evM;
                const evEnd = evStart + (evDur * 60);

                // Overlap condition
                if (newStart < evEnd && evStart < newEnd) {
                    return res.status(400).json({ error: 'One or more venues are already booked during this time slot.' });
                }
            }
        }

        let imagePath = null;
        if (imageBase64) {
            const matches = imageBase64.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ error: 'Invalid image format. Only PNG, JPEG, WEBP allowed.' });
            }
            const buffer = Buffer.from(matches[2], 'base64');
            if (buffer.length > 5 * 1024 * 1024) { // 5MB
                return res.status(400).json({ error: 'Image exceeds 5MB size limit.' });
            }
            const ext = matches[1];
            const filename = `event_${crypto.randomUUID()}.${ext}`;
            fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
            imagePath = `/uploads/${filename}`;
        }

        const newEvent = { id: crypto.randomUUID(), title, venueIds, date, time, duration, description, image: imagePath, organizerId, eventType: eventType || 'individual', teamSize: eventType === 'team' ? parseInt(teamSize) : null };
        events.push(newEvent);
        await writeJson(EVENTS_FILE, events);
        res.status(201).json(newEvent);
    } catch (e) { res.status(500).json({ error: 'Failed to create event' }); }
});

app.delete('/api/events/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer only' });
    try {
        const events = await readJson(EVENTS_FILE);
        const idx = events.findIndex(e => e.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Event not found' });
        
        const event = events[idx];
        if (event.organizerId !== req.user.id) return res.status(403).json({ error: 'You do not own this event' });
        
        const eventDateTime = new Date(`${event.date}T${event.time}`);
        if (eventDateTime < new Date()) return res.status(400).json({ error: 'Cannot delete past events' });

        events.splice(idx, 1);
        await writeJson(EVENTS_FILE, events);
        
        const registrations = await readJson(REGISTRATIONS_FILE);
        const newRegs = registrations.filter(r => r.eventId !== req.params.id);
        await writeJson(REGISTRATIONS_FILE, newRegs);
        
        res.json({ message: 'Event deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete event' }); }
});

app.put('/api/events/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer only' });
    try {
        const events = await readJson(EVENTS_FILE);
        const idx = events.findIndex(e => e.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Event not found' });
        
        const event = events[idx];
        if (event.organizerId !== req.user.id) return res.status(403).json({ error: 'You do not own this event' });
        
        const eventDateTime = new Date(`${event.date}T${event.time}`);
        if (eventDateTime < new Date()) return res.status(400).json({ error: 'Cannot edit past events' });

        const { title, venueIds, date, time, duration, description, imageBase64, eventType, teamSize } = req.body;
        if (!title || !venueIds || !Array.isArray(venueIds) || venueIds.length === 0 || !date || !time || !duration) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const newEventDateTime = new Date(`${date}T${time}`);
        if (newEventDateTime < new Date()) return res.status(400).json({ error: 'Cannot schedule events in the past' });

        const [newH, newM] = time.split(':').map(Number);
        const newStart = (newH * 60) + newM;
        const newEnd = newStart + (parseFloat(duration) * 60);

        for (let vid of venueIds) {
            const venueEventsOnDate = events.filter(e => {
                if (e.id === event.id) return false;
                const vIds = e.venueIds ? e.venueIds : (e.venueId ? [e.venueId] : []);
                return vIds.includes(vid) && e.date === date;
            });
            for (let ev of venueEventsOnDate) {
                const evDur = ev.duration ? parseFloat(ev.duration) : 2;
                const [evH, evM] = ev.time.split(':').map(Number);
                const evStart = (evH * 60) + evM;
                const evEnd = evStart + (evDur * 60);
                if (newStart < evEnd && evStart < newEnd) {
                    return res.status(400).json({ error: 'One or more venues are already booked during this time slot.' });
                }
            }
        }

        const venues = await readJson(VENUES_FILE);
        const evVenues = venueIds.map(vid => venues.find(v => v.id === vid)).filter(Boolean);
        const totalCapacity = evVenues.reduce((sum, v) => sum + v.capacity, 0);
        
        const registrations = await readJson(REGISTRATIONS_FILE);
        const eventRegs = registrations.filter(r => r.eventId === event.id);
        if (eventRegs.length > totalCapacity) {
            return res.status(400).json({ error: `Cannot reduce capacity. Event already has ${eventRegs.length} bookings.` });
        }

        let imagePath = event.image;
        if (imageBase64) {
            const matches = imageBase64.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                if (buffer.length <= 5 * 1024 * 1024) {
                    const ext = matches[1];
                    const filename = `event_${crypto.randomUUID()}.${ext}`;
                    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
                    imagePath = `/uploads/${filename}`;
                }
            }
        }

        const updatedEvent = { ...event, title, venueIds, date, time, duration, description, image: imagePath, eventType: eventType || 'individual', teamSize: eventType === 'team' ? parseInt(teamSize) : null };
        events[idx] = updatedEvent;
        await writeJson(EVENTS_FILE, events);
        
        res.json(updatedEvent);
    } catch (e) { res.status(500).json({ error: 'Failed to edit event' }); }
});

app.get('/api/events/:id/participants', verifyToken, async (req, res) => {
    if (req.user.role !== 'organizer') return res.status(403).json({ error: 'Organizer only' });
    try {
        const events = await readJson(EVENTS_FILE);
        const event = events.find(e => e.id === req.params.id);
        if (!event || event.organizerId !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        const registrations = await readJson(REGISTRATIONS_FILE);
        const participants = registrations.filter(r => r.eventId === req.params.id);
        res.json({ participants });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch participants' }); }
});

// --- REGISTRATIONS API (User) ---
app.get('/api/events/:id/seats', async (req, res) => {
    try {
        const registrations = await readJson(REGISTRATIONS_FILE);
        const eventRegs = registrations.filter(r => r.eventId === req.params.id);
        res.json({ bookedSeats: eventRegs.map(r => r.seatId) });
    } catch (e) { res.status(500).json({ error: 'Failed to get seats' }); }
});

app.post('/api/register', verifyToken, async (req, res) => {
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Only users can register for events' });
    try {
        const { eventId, userName, userEmail, seatIds, teamMembers } = req.body;
        if (!eventId || !userName || !userEmail) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const events = await readJson(EVENTS_FILE);
        const event = events.find(e => e.id === eventId);
        if (!event) return res.status(404).json({ error: 'Event not found' });

        const venues = await readJson(VENUES_FILE);
        const vIds = event.venueIds ? event.venueIds : (event.venueId ? [event.venueId] : []);
        const evVenues = vIds.map(vid => venues.find(v => v.id === vid)).filter(Boolean);
        
        if (evVenues.length === 0) return res.status(404).json({ error: 'Venues not found' });
        const totalCapacity = evVenues.reduce((sum, v) => sum + v.capacity, 0);

        const registrations = await readJson(REGISTRATIONS_FILE);
        const eventRegs = registrations.filter(r => r.eventId === eventId);
        
        // Ensure user hasn't already registered
        if (eventRegs.some(r => r.userEmail === userEmail)) {
            return res.status(400).json({ error: 'You have already registered for this event.' });
        }

        let finalSeatIds = [];

        if (event.eventType === 'team') {
            const teamSize = event.teamSize || 2;
            if (eventRegs.length + teamSize > totalCapacity) {
                return res.status(400).json({ error: `Not enough seats available for a team of ${teamSize}` });
            }
            
            // Auto-assign seats
            const bookedSeatIds = eventRegs.map(r => r.seatId);
            for (let v of evVenues) {
                for (let i = 0; i < v.capacity; i++) {
                    const rowChar = String.fromCharCode(65 + Math.floor(i / 10));
                    const colNum = (i % 10) + 1;
                    const sid = `${v.name}-${rowChar}${colNum}`;
                    if (!bookedSeatIds.includes(sid) && !finalSeatIds.includes(sid)) {
                        finalSeatIds.push(sid);
                        if (finalSeatIds.length === teamSize) break;
                    }
                }
                if (finalSeatIds.length === teamSize) break;
            }

            if (finalSeatIds.length < teamSize) {
                return res.status(400).json({ error: 'Not enough seats available' });
            }

        } else {
            // Individual manual selection
            if (!seatIds || !Array.isArray(seatIds) || seatIds.length !== 1) {
                return res.status(400).json({ error: 'Please select exactly 1 seat.' });
            }
            finalSeatIds = seatIds;
            
            if (eventRegs.length + 1 > totalCapacity) {
                return res.status(400).json({ error: 'Not enough seats available' });
            }

            if (eventRegs.some(r => r.seatId === finalSeatIds[0])) {
                return res.status(400).json({ error: `Seat ${finalSeatIds[0]} is already booked` });
            }
        }

        const newRegs = finalSeatIds.map((sid, idx) => ({
            id: crypto.randomUUID(),
            eventId,
            userName: (event.eventType === 'team' && teamMembers && teamMembers[idx]) ? teamMembers[idx] : userName,
            userEmail,
            seatId: sid,
            timestamp: new Date().toISOString()
        }));

        registrations.push(...newRegs);
        await writeJson(REGISTRATIONS_FILE, registrations);
        
        res.status(201).json({ message: 'Registration successful', registrations: newRegs });
    } catch (e) { res.status(500).json({ error: 'Failed to register' }); }
});

app.get('/api/user/bookings', verifyToken, async (req, res) => {
    if (req.user.role !== 'user') return res.status(403).json({ error: 'Only users can fetch their bookings' });
    try {
        const users = await readJson(USERS_FILE);
        const user = users.find(u => u.id === req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const registrations = await readJson(REGISTRATIONS_FILE);
        const myRegs = registrations.filter(r => r.userEmail === user.email);
        
        const events = await readJson(EVENTS_FILE);
        const venues = await readJson(VENUES_FILE);
        
        const groupedBookings = {};
        for (let reg of myRegs) {
            if (!groupedBookings[reg.eventId]) {
                const ev = events.find(e => e.id === reg.eventId);
                if (!ev) continue;
                
                const vIds = ev.venueIds ? ev.venueIds : (ev.venueId ? [ev.venueId] : []);
                const evVenues = vIds.map(vid => venues.find(v => v.id === vid)).filter(Boolean);
                const venueNames = evVenues.map(v => v.name).join(', ') || 'Unknown Venue';
                
                groupedBookings[reg.eventId] = {
                    ...ev,
                    venueName: venueNames,
                    seatIds: [],
                    timestamp: reg.timestamp
                };
            }
            groupedBookings[reg.eventId].seatIds.push(reg.seatId);
        }
        
        const bookedEvents = Object.values(groupedBookings);

        // Sort by date (most recent first)
        bookedEvents.sort((a,b) => b.date.localeCompare(a.date));

        res.json(bookedEvents);
    } catch (e) { res.status(500).json({ error: 'Failed to get bookings' }); }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
