document.addEventListener('DOMContentLoaded', () => {
    // --- AUTH PORTAL LOGIC ---
    const loginPortal = document.getElementById('login-portal');
    const appPortal = document.getElementById('app-portal');
    const roleBtns = document.querySelectorAll('.role-btn');
    const authTabBtns = document.querySelectorAll('.auth-tab');
    
    const formLogin = document.getElementById('formLogin');
    const formRegister = document.getElementById('formRegister');
    
    let currentAuthRole = 'user'; // default
    let activeUser = null;

    // Switch Role
    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentAuthRole = btn.dataset.role;

            // Admin cannot register
            if (currentAuthRole === 'admin') {
                authTabBtns[0].click(); // Force Login tab
                document.getElementById('register-tab-btn').style.display = 'none';
                
                // Hide email, show password only
                document.getElementById('loginEmailGroup').style.display = 'none';
                document.getElementById('logEmail').required = false;
            } else {
                document.getElementById('register-tab-btn').style.display = 'block';
                document.getElementById('loginEmailGroup').style.display = 'block';
                document.getElementById('logEmail').required = true;
            }
        });
    });

    // Switch Login/Register Tabs
    authTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if(btn.id === 'register-tab-btn' && currentAuthRole === 'admin') return;

            authTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (btn.dataset.mode === 'login') {
                formLogin.style.display = 'block';
                formRegister.style.display = 'none';
            } else {
                formLogin.style.display = 'none';
                formRegister.style.display = 'block';
            }
        });
    });

    // Handle Login
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            role: currentAuthRole,
            password: document.getElementById('logPass').value
        };

        if (currentAuthRole !== 'admin') {
            payload.email = document.getElementById('logEmail').value;
        }

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok) {
                activeUser = data;
                localStorage.setItem('activeUser', JSON.stringify(data));
                initApp();
            } else {
                showToast(data.error, true);
            }
        } catch (err) {
            showToast('Network error during login', true);
        }
    });

    // Handle Register
    formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            role: currentAuthRole,
            name: document.getElementById('regNameInput').value,
            email: document.getElementById('regEmailInput').value,
            password: document.getElementById('regPassInput').value
        };

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok) {
                if (currentAuthRole === 'organizer') {
                    showToast('Registration successful! Please wait for Admin approval.');
                } else {
                    showToast('Registration successful! You can now log in.');
                }
                formRegister.reset();
                authTabBtns[0].click(); // Switch to login
            } else {
                showToast(data.error, true);
            }
        } catch (err) {
            showToast('Network error during registration', true);
        }
    });

    function initApp() {
        showToast(`Welcome back, ${activeUser.name}`);
        document.getElementById('displayUserName').textContent = `${activeUser.name} [${activeUser.role.toUpperCase()}]`;
        loginPortal.style.display = 'none';
        appPortal.style.display = 'block';

        // Route to specific view based on role
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        if (activeUser.role === 'admin') {
            document.getElementById('admin-view').classList.add('active');
            fetchVenues();
            fetchPendingOrganizers();
            fetchAllUsers();
        } else if (activeUser.role === 'organizer') {
            document.getElementById('organizer-view').classList.add('active');
            populateVenueDropdown();
            fetchOrganizerEvents();
        } else if (activeUser.role === 'user') {
            document.getElementById('user-view').classList.add('active');
            fetchEvents();
            fetchUserBookings();
        }
    }

    document.getElementById('btnLogout').addEventListener('click', () => {
        activeUser = null;
        localStorage.removeItem('activeUser');
        appPortal.style.display = 'none';
        loginPortal.style.display = 'flex';
        formLogin.reset();
        formRegister.reset();
    });

    // Restore session on load
    const savedUser = localStorage.getItem('activeUser');
    if (savedUser) {
        activeUser = JSON.parse(savedUser);
        initApp();
    }

    // Toasts
    function showToast(message, isError = false) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        container.appendChild(toast);
        void toast.offsetWidth; // reflow
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- ADMIN (Venues & Organizers) ---
    const createVenueForm = document.getElementById('createVenueForm');
    const venuesTableBody = document.getElementById('venuesTableBody');
    const orgTableBody = document.getElementById('orgTableBody');

    async function fetchVenues() {
        try {
            const res = await fetch('/api/venues');
            const venues = await res.json();
            venuesTableBody.innerHTML = venues.map(v => `
                <tr>
                    <td>${v.name}</td>
                    <td>${v.type}</td>
                    <td>${v.capacity}</td>
                    <td><button class="btn btn-sm" style="background: #e74c3c; padding: 0.2rem 0.5rem;" onclick="window.deleteVenue('${v.id}')">Delete</button></td>
                </tr>
            `).join('');
        } catch (e) { showToast('Failed to load venues', true); }
    }

    async function fetchPendingOrganizers() {
        try {
            const res = await fetch('/api/admin/organizers');
            const organizers = await res.json();
            
            if (organizers.length === 0) {
                orgTableBody.innerHTML = '<tr><td colspan="4">No organizers found.</td></tr>';
                return;
            }

            orgTableBody.innerHTML = organizers.map(o => `
                <tr>
                    <td>${o.name}</td>
                    <td>${o.email}</td>
                    <td><span class="badge ${o.status}">${o.status.toUpperCase()}</span></td>
                    <td>
                        ${o.status === 'pending' ? `<button class="btn-verify" onclick="window.verifyOrg('${o.id}')">Approve</button>` : 'Verified'}
                    </td>
                </tr>
            `).join('');
        } catch (e) { showToast('Failed to load organizers', true); }
    }

    window.verifyOrg = async (id) => {
        try {
            const res = await fetch(`/api/admin/organizers/${id}/verify`, { method: 'POST' });
            if (res.ok) {
                showToast('Organizer approved!');
                fetchPendingOrganizers();
                fetchAllUsers();
            } else {
                showToast('Failed to approve organizer', true);
            }
        } catch (e) { showToast('Network error', true); }
    };

    async function fetchAllUsers() {
        try {
            const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${activeUser.token}` }});
            const users = await res.json();
            const allUsersBody = document.getElementById('allUsersTableBody');
            if (users.length === 0) {
                allUsersBody.innerHTML = '<tr><td colspan="4">No users found.</td></tr>';
                return;
            }
            allUsersBody.innerHTML = users.map(u => `
                <tr>
                    <td><span class="badge ${u.role}">${u.role.toUpperCase()}</span></td>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td><span class="badge ${u.status}">${u.status.toUpperCase()}</span></td>
                </tr>
            `).join('');
        } catch (e) { showToast('Failed to load all users', true); }
    }

    window.deleteVenue = async (id) => {
        if (!confirm('Are you sure you want to delete this venue?')) return;
        try {
            const res = await fetch(`/api/venues/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${activeUser.token}` }
            });
            if (res.ok) {
                showToast('Venue deleted successfully!');
                fetchVenues();
            } else {
                showToast('Failed to delete venue', true);
            }
        } catch (e) { showToast('Network error', true); }
    };

    createVenueForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('venName').value,
            type: document.getElementById('venType').value,
            capacity: document.getElementById('venCapacity').value
        };
        try {
            const res = await fetch('/api/venues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Venue added successfully');
                createVenueForm.reset();
                fetchVenues();
            } else throw new Error();
        } catch (e) { showToast('Error adding venue', true); }
    });

    // --- ORGANIZER (Events) ---
    const createEventForm = document.getElementById('createEventForm');
    const evVenueSelect = document.getElementById('evVenue');
    const venueSlotsVisualizer = document.getElementById('venueSlotsVisualizer');

    const organizerEventsGrid = document.getElementById('organizerEventsGrid');

    async function fetchOrganizerEvents() {
        if (!activeUser || activeUser.role !== 'organizer') return;
        try {
            const res = await fetch('/api/events');
            const allEvents = await res.json();
            const myEvents = allEvents.filter(e => e.organizerId === activeUser.id);
            
            const now = new Date();
            const upcoming = [];
            const past = [];

            myEvents.forEach(e => {
                const dur = e.duration ? parseFloat(e.duration) : 2;
                const eventDateTime = new Date(`${e.date}T${e.time}`);
                eventDateTime.setMinutes(eventDateTime.getMinutes() + (dur * 60));
                if (eventDateTime >= now) upcoming.push(e);
                else past.push(e);
            });

            upcoming.sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
            past.sort((a,b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

            const renderCard = (e, isPast) => `
                <div class="event-card">
                    ${e.image ? `<img src="${e.image}" alt="${e.title}" class="event-image">` : ''}
                    <div class="event-content">
                        <div class="event-title">${e.title}</div>
                        <div class="event-meta">
                            <div><strong>Date:</strong> ${e.date}</div>
                            <div><strong>Time:</strong> ${e.time} ${e.duration ? `(${e.duration} hours)` : ''}</div>
                            <div><strong>Venue:</strong> ${e.venueName} (${e.venueType})</div>
                            <div style="margin-top:0.5rem; color:var(--primary);"><strong>Participants:</strong> ${e.bookedSeats} / ${e.capacity}</div>
                        </div>
                        <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-sm" onclick="window.viewParticipants('${e.id}')">View Participants</button>
                            ${!isPast ? `
                            <button class="btn btn-sm" onclick="window.openEditEventModal('${e.id}')">Edit</button>
                            <button class="btn btn-sm" style="background:var(--error);" onclick="window.deleteEvent('${e.id}')">Delete</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('organizerEventsGrid').innerHTML = upcoming.length === 0
                ? '<p style="color: var(--text-secondary);">No upcoming events.</p>'
                : upcoming.map(e => renderCard(e, false)).join('');

            document.getElementById('organizerPastEventsGrid').innerHTML = past.length === 0
                ? '<p style="color: var(--text-secondary);">No past events.</p>'
                : past.map(e => renderCard(e, true)).join('');
            
            window.organizerEvents = myEvents;
        } catch (e) { showToast('Failed to load your events', true); }
    }

    async function populateVenueDropdown() {
        try {
            const res = await fetch('/api/venues');
            const venues = await res.json();
            evVenueSelect.innerHTML = venues.length === 0 
                ? '<option value="" disabled selected>No venues available. Admin must add venues.</option>'
                : '<option value="" disabled selected>Select a venue...</option>' + 
                  venues.map(v => `<option value="${v.id}">${v.name} (${v.capacity} seats)</option>`).join('');
        } catch (e) { showToast('Failed to load venues', true); }
    }

    evVenueSelect.addEventListener('change', async (e) => {
        // Disabled venue slot visualizer for multi-venue
        venueSlotsVisualizer.style.display = 'none';
    });

    createEventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const selectedVenues = Array.from(document.getElementById('evVenue').selectedOptions).map(opt => opt.value);
        if (selectedVenues.length === 0) {
            showToast('Please select at least one venue', true);
            return;
        }

        const payload = {
            title: document.getElementById('evTitle').value,
            venueIds: selectedVenues,
            date: document.getElementById('evDate').value,
            time: document.getElementById('evTime').value,
            duration: document.getElementById('evDuration').value,
            description: document.getElementById('evDesc').value,
            organizerId: activeUser.id,
            eventType: document.getElementById('evEventType').value,
            teamSize: document.getElementById('evEventType').value === 'team' ? parseInt(document.getElementById('evTeamSize').value) : null
        };

        const imageFile = document.getElementById('evImage').files[0];
        
        const submitData = async () => {
            try {
                const res = await fetch('/api/events', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${activeUser.token}`
                    },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast('Event created successfully!');
                    createEventForm.reset();
                    fetchOrganizerEvents();
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Failed to create event', true);
                }
            } catch (e) { showToast('Error creating event', true); }
        };

        if (imageFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                payload.imageBase64 = e.target.result;
                submitData();
            };
            reader.readAsDataURL(imageFile);
        } else {
            submitData();
        }
    });

    window.deleteEvent = async (id) => {
        if (!confirm('Are you sure you want to delete this event? This will also remove all bookings for it.')) return;
        try {
            const res = await fetch(`/api/events/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${activeUser.token}` }
            });
            if (res.ok) {
                showToast('Event deleted.');
                fetchOrganizerEvents();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to delete event', true);
            }
        } catch (e) { showToast('Network error', true); }
    };

    window.openEditEventModal = async (id) => {
        const ev = window.organizerEvents.find(e => e.id === id);
        if (!ev) return;
        
        document.getElementById('editEvId').value = ev.id;
        document.getElementById('editEvTitle').value = ev.title;
        document.getElementById('editEvDate').value = ev.date;
        document.getElementById('editEvTime').value = ev.time;
        document.getElementById('editEvDuration').value = ev.duration;
        document.getElementById('editEvDesc').value = ev.description;
        document.getElementById('editEvEventType').value = ev.eventType || 'individual';
        document.getElementById('editEvTeamSizeGroup').style.display = ev.eventType === 'team' ? 'block' : 'none';
        if (ev.eventType === 'team') document.getElementById('editEvTeamSize').value = ev.teamSize || 2;
        
        // Populate venues
        const editVenueSelect = document.getElementById('editEvVenue');
        try {
            const res = await fetch('/api/venues');
            const venues = await res.json();
            editVenueSelect.innerHTML = venues.map(v => {
                const selected = ev.venueIds.includes(v.id) ? 'selected' : '';
                return `<option value="${v.id}" ${selected}>${v.name} (${v.capacity} seats)</option>`;
            }).join('');
        } catch(e) {}

        document.getElementById('editEventModal').classList.add('active');
        
        flatpickr("#editEvTime", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, defaultDate: ev.time });
    };

    document.getElementById('closeEditEventModal').addEventListener('click', () => {
        document.getElementById('editEventModal').classList.remove('active');
    });

    document.getElementById('editEventForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editEvId').value;
        const selectedVenues = Array.from(document.getElementById('editEvVenue').selectedOptions).map(opt => opt.value);
        if (selectedVenues.length === 0) return showToast('Select at least one venue', true);

        const payload = {
            title: document.getElementById('editEvTitle').value,
            venueIds: selectedVenues,
            date: document.getElementById('editEvDate').value,
            time: document.getElementById('editEvTime').value,
            duration: document.getElementById('editEvDuration').value,
            description: document.getElementById('editEvDesc').value,
            eventType: document.getElementById('editEvEventType').value,
            teamSize: document.getElementById('editEvEventType').value === 'team' ? parseInt(document.getElementById('editEvTeamSize').value) : null
        };

        const imageFile = document.getElementById('editEvImage').files[0];

        const submitEdit = async () => {
            try {
                const res = await fetch(`/api/events/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeUser.token}` },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast('Event updated successfully!');
                    document.getElementById('editEventModal').classList.remove('active');
                    fetchOrganizerEvents();
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Failed to update event', true);
                }
            } catch (e) { showToast('Error updating event', true); }
        };

        if (imageFile) {
            const reader = new FileReader();
            reader.onload = (e) => { payload.imageBase64 = e.target.result; submitEdit(); };
            reader.readAsDataURL(imageFile);
        } else {
            submitEdit();
        }
    });

    window.viewParticipants = async (id) => {
        try {
            const res = await fetch(`/api/events/${id}/participants`, {
                headers: { 'Authorization': `Bearer ${activeUser.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const tbody = document.getElementById('participantsTableBody');
                if (data.participants.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3">No participants yet.</td></tr>';
                } else {
                    tbody.innerHTML = data.participants.map(p => `
                        <tr>
                            <td>${p.userName}</td>
                            <td>${p.userEmail}</td>
                            <td>${p.seatId}</td>
                        </tr>
                    `).join('');
                }
                document.getElementById('participantsModal').classList.add('active');
            } else {
                showToast('Failed to load participants', true);
            }
        } catch (e) { showToast('Network error', true); }
    };

    document.getElementById('closeParticipantsModal').addEventListener('click', () => {
        document.getElementById('participantsModal').classList.remove('active');
    });

    // --- USER (Events & Registration) ---
    const eventsGrid = document.getElementById('eventsGrid');
    const regModal = document.getElementById('regModal');
    const closeModalBtn = document.getElementById('closeModal');
    const seatGrid = document.getElementById('seatGrid');
    const regForm = document.getElementById('regForm');
    
    let currentEvent = null;
    let selectedSeats = [];

    async function fetchEvents() {
        try {
            const res = await fetch('/api/events?type=upcoming');
            const events = await res.json();
            eventsGrid.innerHTML = events.length === 0 
                ? '<p>No upcoming events found.</p>'
                : events.map(e => `
                    <div class="event-card">
                        ${e.image ? `<img src="${e.image}" alt="${e.title}" class="event-image">` : ''}
                        <div class="event-content">
                            <div class="event-title">${e.title}</div>
                            <div class="event-meta">
                                <div><strong>Date:</strong> ${e.date}</div>
                                <div><strong>Time:</strong> ${e.time} ${e.duration ? `(${e.duration} hours)` : ''}</div>
                                <div><strong>Venue:</strong> ${e.venueName} (${e.venueType})</div>
                                ${e.eventType === 'team' ? `<div><strong>Team Size:</strong> ${e.teamSize} seats</div>` : ''}
                            </div>
                            <p class="event-desc">${e.description}</p>
                            <button class="btn ${e.bookedSeats >= e.capacity ? 'btn-secondary' : 'btn-primary'}" style="width: 100%;" ${e.bookedSeats >= e.capacity ? 'disabled' : ''} onclick="${e.eventType === 'team' ? `window.registerTeam('${e.id}')` : `window.openRegModal('${e.id}')`}">${e.bookedSeats >= e.capacity ? 'Fully Booked' : (e.eventType === 'team' ? 'Book Team' : 'Book Seat')}</button>
                        </div>
                    </div>
                `).join('');
            
            window.allEvents = events;
        } catch (e) { showToast('Failed to load events', true); }
    }

    async function fetchUserBookings() {
        if (!activeUser || activeUser.role !== 'user') return;
        try {
            const res = await fetch('/api/user/bookings', {
                headers: { 'Authorization': `Bearer ${activeUser.token}` }
            });
            if (res.ok) {
                const bookings = await res.json();
                const now = new Date();
                const upcoming = [];
                const past = [];
                
                bookings.forEach(b => {
                    const dur = b.duration ? parseFloat(b.duration) : 2;
                    const eventDateTime = new Date(`${b.date}T${b.time}`);
                    eventDateTime.setMinutes(eventDateTime.getMinutes() + (dur * 60));
                    
                    if (eventDateTime < now) {
                        past.push(b);
                    } else {
                        upcoming.push(b);
                    }
                });

                const renderCards = (list) => {
                    return list.length === 0 ? '<p>No bookings found.</p>' : list.map(b => `
                        <div class="event-card" style="border-left: 4px solid var(--primary);">
                            <div class="event-content">
                                <div class="event-title">${b.title}</div>
                                <div class="event-meta" style="margin-top: 0.5rem;">
                                    <div><strong>Date:</strong> ${b.date} | <strong>Time:</strong> ${b.time}</div>
                                    <div><strong>Venue:</strong> ${b.venueName}</div>
                                    <div><strong style="color: var(--primary);">Seats: ${b.seatIds.join(', ')}</strong></div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                };

                document.getElementById('userBookingsGrid').innerHTML = renderCards(upcoming);
                document.getElementById('userPastBookingsGrid').innerHTML = renderCards(past);
            }
        } catch (e) { showToast('Failed to load bookings', true); }
    }

    const teamRegModal = document.getElementById('teamRegModal');
    const closeTeamRegModalBtn = document.getElementById('closeTeamRegModal');
    const teamMembersInputs = document.getElementById('teamMembersInputs');
    const teamRegForm = document.getElementById('teamRegForm');
    
    window.registerTeam = async (eventId) => {
        if (!activeUser) return showToast('Please log in first', true);
        currentEvent = window.allEvents.find(e => e.id === eventId);
        if (!currentEvent) return;

        document.getElementById('teamModalTitle').textContent = `Register Team for ${currentEvent.title}`;
        
        teamMembersInputs.innerHTML = '';
        for (let i = 0; i < currentEvent.teamSize; i++) {
            teamMembersInputs.innerHTML += `
                <div class="input-group">
                    <label>Team Member ${i + 1} Name ${i === 0 ? '(You)' : ''}</label>
                    <input type="text" id="teamMemberName_${i}" class="team-member-input" required ${i === 0 ? `value="${activeUser.name}" readonly` : ''}>
                </div>
            `;
        }

        teamRegModal.classList.add('active');
    };

    closeTeamRegModalBtn.addEventListener('click', () => {
        teamRegModal.classList.remove('active');
        currentEvent = null;
    });

    teamRegForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentEvent || !activeUser) return;

        const inputs = document.querySelectorAll('.team-member-input');
        const teamMembers = Array.from(inputs).map(inp => inp.value);

        const payload = {
            eventId: currentEvent.id,
            userName: activeUser.name,
            userEmail: activeUser.email,
            eventType: 'team',
            teamMembers: teamMembers
        };

        const btn = document.getElementById('submitTeamRegBtn');
        btn.disabled = true;

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeUser.token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                showToast(`Successfully booked ${data.registrations.length} seats for your team!`);
                teamRegModal.classList.remove('active');
                fetchUserBookings();
                fetchEvents();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to book team', true);
            }
        } catch (err) {
            showToast('Network error', true);
        }
        btn.disabled = false;
    });

    window.openRegModal = async (eventId) => {
        currentEvent = window.allEvents.find(e => e.id === eventId);
        if (!currentEvent) return;

        document.getElementById('modalTitle').textContent = currentEvent.title;
        document.getElementById('modalMeta').textContent = `${currentEvent.date} | ${currentEvent.time} | ${currentEvent.venueName}`;
        
        selectedSeats = [];
        document.getElementById('displaySeat').textContent = 'None';
        document.getElementById('submitRegBtn').disabled = true;

        regModal.classList.add('active');

        try {
            const res = await fetch(`/api/events/${eventId}/seats`);
            const data = await res.json();
            renderSeats(currentEvent, data.bookedSeats);
        } catch (e) { showToast('Failed to load seats', true); }
    };

    function renderSeats(event, bookedSeats) {
        seatGrid.innerHTML = '';
        if (event.venuesList && event.venuesList.length > 0) {
            event.venuesList.forEach(venue => {
                const venueHeader = document.createElement('h4');
                venueHeader.textContent = venue.name;
                venueHeader.style.color = 'var(--primary)';
                venueHeader.style.gridColumn = '1 / -1';
                venueHeader.style.marginTop = '1rem';
                seatGrid.appendChild(venueHeader);
                
                for (let i = 0; i < venue.capacity; i++) {
                    const rowChar = String.fromCharCode(65 + Math.floor(i / 10));
                    const colNum = (i % 10) + 1;
                    const seatId = `${venue.name}-${rowChar}${colNum}`;

                    const seatEl = document.createElement('div');
                    seatEl.className = 'seat';
                    seatEl.textContent = `${rowChar}${colNum}`;
                    seatEl.title = seatId;
                    
                    if (bookedSeats.includes(seatId)) {
                        seatEl.classList.add('booked');
                    } else {
                        seatEl.classList.add('available');
                        seatEl.onclick = () => selectSeat(seatEl, seatId);
                    }
                    seatGrid.appendChild(seatEl);
                }
            });
        }
    }

    function selectSeat(el, seatId) {
        const prev = seatGrid.querySelector('.selected');
        if (prev) prev.classList.remove('selected');
        selectedSeats = [seatId];
        el.classList.add('selected');
        
        document.getElementById('displaySeat').textContent = selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None';
        document.getElementById('submitRegBtn').disabled = selectedSeats.length === 0;
    }

    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (selectedSeats.length === 0 || !activeUser) return;

        const payload = {
            eventId: currentEvent.id,
            userName: activeUser.name,
            userEmail: activeUser.email,
            seatIds: selectedSeats
        };

        const btn = document.getElementById('submitRegBtn');
        btn.disabled = true;

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeUser.token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast(`Successfully booked ${selectedSeats.length} seat(s)!`);
                closeModal();
                fetchUserBookings(); // Refresh user bookings
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to book', true);
            }
        } catch (e) {
            showToast('Network error', true);
            btn.disabled = false;
        }
    });

    function closeModal() { regModal.classList.remove('active'); currentEvent = null; }
    closeModalBtn.addEventListener('click', closeModal);

    // Initialize Flatpickr for beautiful Time UI
    flatpickr("#evTime", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true
    });
});
