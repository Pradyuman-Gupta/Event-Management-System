# Event Management System

A small Express-based event management website that stores data in the `data/` folder. It provides separate roles for **admin** and **organizer**, and a simple front-end under `public/`.

**Quick summary**
- Admin: full access to manage users, venues and registrations.
- Organizer: can create and manage their events and view registrations for their events.

**Key features**
- Create, list and manage events
- Register users for events (seat assignment)
- Manage venues and capacities
- Simple role-based access for admin and organizers

## Roles & responsibilities

- **Admin**
	- Manage users (activate/deactivate)
	- Manage venues (add/edit/remove)
	- View all events and registrations

- **Organizer**
	- Create and update events they organize
	- Upload event images
	- View registrations for their events

> Note: Roles are represented in `data/users.json` using the `role` field.

## Project structure

- `server.js` — backend server (Express)
- `public/` — frontend assets (`index.html`, `app.js`, `style.css`)
- `data/` — JSON files used as the project's data store

## Data
Data is stored in JSON files inside the `data/` folder. These files are read by the server at runtime.

- `data/events.json` — list of events (id, title, venueIds, date, time, duration, description, image, organizerId, eventType, teamSize)
- `data/registrations.json` — event registrations (id, eventId, userName, userEmail, seatId, timestamp)
- `data/users.json` — users and organizers (id, role, name, email, password (hashed), status)
- `data/venues.json` — available venues (id, name, type, capacity)

See the files for sample data and identifiers used to link events, venues and registrations.

## Run locally

1. Install dependencies

```bash
npm install
```

2. Start the server

```bash
node server.js
```

3. Open the app in a browser at `http://localhost:3000` (or the port printed by the server).

## Notes on security
- Passwords in `data/users.json` are stored as bcrypt hashes. Do not commit real credentials.
- The current data store is file-based JSON — for production, migrate to a proper database.

## Contributing
- Create an issue for feature requests or bugs.
- Pull requests are welcome — keep changes focused and add tests where appropriate.

## License
This project is provided as-is; add a license file if you plan to publish it.
