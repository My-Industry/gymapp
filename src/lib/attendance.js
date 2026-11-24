// Text for the Attendance page (beta). Nothing here connects to a machine yet:
// the page only lists the fingerprint machines gyms commonly use, so owners can see what is planned.
// Each small card is { icon, title, text }.

export const ATTENDANCE_INTRO = {
  title: 'Attendance',
  badge: 'Beta',
  lead: 'Mark who came to the gym today, using the fingerprint machine at your door.',
  note: 'This is an early beta. Daily attendance is not working yet. This page lists the machines we plan to connect, and it will grow as we add them.',
};

// How attendance will work once a machine is connected.
export const HOW_IT_WORKS = [
  { icon: '🖐️', title: '1. Member scans a finger', text: 'The member places a finger on the machine when they walk in.' },
  { icon: '🔗', title: '2. Machine sends the entry', text: 'The machine’s entry is picked up by Gym Manager, with the member and the time.' },
  { icon: '📅', title: '3. Attendance is marked', text: 'The member shows as present for the day. No register, no manual marking.' },
  { icon: '🔔', title: '4. You see who is regular', text: 'Spot members who stopped coming, and remind them on WhatsApp.' },
];

// Fingerprint machines used in gyms. "models" are examples of well-known ranges, not a promise of support.
// status is 'Planned' for all of them: none is connected yet.
export const MACHINES = [
  {
    brand: 'ZKTeco',
    models: 'K40, MB160, F18',
    text: 'The most common fingerprint attendance machines in Indian gyms. Many other brands are built on ZKTeco.',
    status: 'Planned',
  },
  {
    brand: 'eSSL',
    models: 'X990, K30 Pro, MB160',
    text: 'A popular Indian brand, easy to find and service. Sold in many local shops.',
    status: 'Planned',
  },
  {
    brand: 'Realtime',
    models: 'Fingerprint attendance terminals',
    text: 'Another Indian brand with simple, low-cost machines that suit a small gym.',
    status: 'Planned',
  },
  {
    brand: 'Hikvision',
    models: 'DS-K1T804 series',
    text: 'Fingerprint access terminals that can also open a door or turnstile. Good for larger gyms.',
    status: 'Planned',
  },
  {
    brand: 'Suprema',
    models: 'BioStation 2, BioEntry',
    text: 'Premium machines with fast scanning. Used in bigger, branded gyms and fitness chains.',
    status: 'Planned',
  },
  {
    brand: 'Matrix COSEC',
    models: 'Fingerprint door controllers',
    text: 'Indian-made machines for access control and attendance, often used with turnstiles.',
    status: 'Planned',
  },
];

// Short advice for owners who have not bought a machine yet.
export const TIPS = [
  { icon: '🛒', title: 'Not bought one yet?', text: 'Wait a little. We will tell you which machines work best with Gym Manager.' },
  { icon: '📶', title: 'Check the connection', text: 'Look for a machine with Wi-Fi or a network (LAN) port. USB-only machines are harder to connect.' },
  { icon: '🧼', title: 'Sweaty fingers', text: 'Gym members often have damp or rough fingers. Pick a machine that reads these well, and keep the sensor clean.' },
  { icon: '🔒', title: 'Fingerprints stay private', text: 'The machine keeps the fingerprints. Gym Manager only needs to know who came and when.' },
];
