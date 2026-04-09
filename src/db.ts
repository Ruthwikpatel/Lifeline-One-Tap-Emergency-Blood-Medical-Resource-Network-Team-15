import fs from 'fs/promises';
import path from 'path';

// Pure JS JSON-based database to avoid GLIBC issues with native sqlite3
const DB_FILE = path.join(process.cwd(), 'database.json');

interface DbData {
  users: any[];
  emergency_requests: any[];
  donation_history: any[];
  blood_bank_inventory: any[];
}

const initialData: DbData = {
  users: [
    {
      user_id: 2,
      name: "Rahul Kumar",
      phone: "9876543210",
      password: "hashed_password",
      blood_group: "O+",
      latitude: 17.3500,
      longitude: 78.7200,
      last_donation_date: null,
      is_available: 1,
      current_mode: "donor",
      address: "Kothapet, Hyderabad"
    },
    {
      user_id: 3,
      name: "Priya Singh",
      phone: "9876543211",
      password: "hashed_password",
      blood_group: "O+",
      latitude: 17.3400,
      longitude: 78.7100,
      last_donation_date: "2025-12-01T10:00:00.000Z",
      is_available: 1,
      current_mode: "donor",
      address: "Dilsukhnagar, Hyderabad"
    },
    {
      user_id: 4,
      name: "Amit Sharma",
      phone: "9876543212",
      password: "hashed_password",
      blood_group: "A+",
      latitude: 17.3800,
      longitude: 78.4800,
      last_donation_date: null,
      is_available: 1,
      current_mode: "donor",
      address: "Abids, Hyderabad"
    },
    {
      user_id: 5,
      name: "Sneha Reddy",
      phone: "9876543213",
      password: "hashed_password",
      blood_group: "B+",
      latitude: 17.4000,
      longitude: 78.4600,
      last_donation_date: null,
      is_available: 1,
      current_mode: "donor",
      address: "Banjara Hills, Hyderabad"
    }
  ],
  emergency_requests: [],
  donation_history: [],
  blood_bank_inventory: [
    { id: 1, hospital_name: 'City General Hospital', blood_group: 'A+', units_available: 10, latitude: 17.3850, longitude: 78.4867, phone: "+91 98480 12345", address: "Nampally, Hyderabad" },
    { id: 2, hospital_name: 'Red Cross Blood Bank', blood_group: 'B+', units_available: 5, latitude: 17.4065, longitude: 78.4691, phone: "+91 98480 23456", address: "Himayatnagar, Hyderabad" },
    { id: 3, hospital_name: 'St. Marys Medical Center', blood_group: 'O-', units_available: 2, latitude: 17.4483, longitude: 78.3915, phone: "+91 98480 34567", address: "Hitech City, Hyderabad" },
    { id: 4, hospital_name: 'Apollo Health City', blood_group: 'AB+', units_available: 8, latitude: 17.4256, longitude: 78.4129, phone: "+91 98480 45678", address: "Jubilee Hills, Hyderabad" },
    { id: 5, hospital_name: 'Global Life Blood Bank', blood_group: 'O+', units_available: 12, latitude: 17.3450, longitude: 78.7150, phone: "+91 98480 56789", address: "Uppal, Hyderabad" },
    { id: 6, hospital_name: 'Sunshine Medical Center', blood_group: 'O+', units_available: 4, latitude: 17.3600, longitude: 78.7300, phone: "+91 98480 67890", address: "Nagole, Hyderabad" }
  ]
};

async function readDb(): Promise<DbData> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

async function writeDb(data: DbData) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

export const getDb = async () => {
  return {
    get: async (query: string, params: any[] = []) => {
      const db = await readDb();
      if (query.includes('FROM users WHERE phone = ?')) {
        return db.users.find(u => u.phone === params[0]);
      }
      if (query.includes('FROM users WHERE user_id = ?')) {
        return db.users.find(u => u.user_id === params[0]);
      }
      if (query.includes('SELECT COUNT(*) FROM donation_history WHERE donor_id = ?')) {
        const count = db.donation_history.filter(d => d.donor_id === params[0]).length;
        return { total_donations: count };
      }
      if (query.includes('FROM emergency_requests WHERE request_id = ?')) {
        return db.emergency_requests.find(r => r.request_id === params[0]);
      }
      if (query.includes('FROM emergency_requests WHERE user_id = ?')) {
        // Handle pending requests for a user
        const requests = db.emergency_requests
          .filter(r => r.user_id === params[0] && r.status === 'pending')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return requests.length > 0 ? requests[0] : null;
      }
      if (query.includes('SELECT COUNT(*)')) {
        return { count: db.blood_bank_inventory.length };
      }
      return null;
    },
    all: async (query: string, params: any[] = []) => {
      const db = await readDb();
      if (query.includes('FROM blood_bank_inventory')) {
        if (params.length > 0) {
          return db.blood_bank_inventory.filter(h => h.blood_group === params[0] && h.units_available > 0);
        }
        return db.blood_bank_inventory;
      }
      if (query.includes('FROM users')) {
        return db.users.filter(u => 
          u.blood_group === params[0] && 
          u.user_id !== params[1] && 
          u.current_mode === 'donor' && 
          u.is_available === 1
        );
      }
      return [];
    },
    run: async (query: string, params: any[] = []) => {
      const db = await readDb();
      if (query.includes('INSERT INTO users')) {
        const existingUser = db.users.find(u => u.phone === params[1]);
        if (existingUser) {
          throw new Error('Phone number already registered');
        }
        const maxId = db.users.reduce((max, u) => Math.max(max, u.user_id || 0), 0);
        const newUser = {
          user_id: maxId + 1,
          name: params[0],
          phone: params[1],
          password: params[2],
          blood_group: params[3],
          latitude: params[4],
          longitude: params[5],
          last_donation_date: null,
          is_available: 1,
          current_mode: 'donor'
        };
        db.users.push(newUser);
        await writeDb(db);
        return { lastID: newUser.user_id };
      }
      if (query.includes('UPDATE users SET current_mode = "patient"')) {
        const user = db.users.find(u => u.user_id === params[0]);
        if (user) user.current_mode = 'patient';
        await writeDb(db);
        return { changes: 1 };
      }
      if (query.includes('UPDATE users SET current_mode = "donor"')) {
        const user = db.users.find(u => u.user_id === params[0]);
        if (user) user.current_mode = 'donor';
        await writeDb(db);
        return { changes: 1 };
      }
      if (query.includes('UPDATE users SET latitude = ?, longitude = ?')) {
        const user = db.users.find(u => u.user_id === params[2]);
        if (user) {
          user.latitude = params[0];
          user.longitude = params[1];
        }
        await writeDb(db);
        return { changes: 1 };
      }
      if (query.includes('UPDATE users SET name = ?, phone = ?, blood_group = ?, current_mode = ?')) {
        const user = db.users.find(u => u.user_id === params[4]);
        if (user) {
          user.name = params[0];
          user.phone = params[1];
          user.blood_group = params[2];
          user.current_mode = params[3];
        }
        await writeDb(db);
        return { changes: 1 };
      }
      if (query.includes('UPDATE users SET password = ?')) {
        const user = db.users.find(u => u.user_id === params[1]);
        if (user) user.password = params[0];
        await writeDb(db);
        return { changes: 1 };
      }
      if (query.includes('UPDATE blood_bank_inventory SET units_available = ?')) {
        const bank = db.blood_bank_inventory.find(b => b.id === params[1] && b.blood_group === params[2]);
        if (bank) {
          bank.units_available = params[0];
          await writeDb(db);
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      if (query.includes('INSERT INTO emergency_requests')) {
        const maxId = db.emergency_requests.reduce((max, r) => Math.max(max, r.request_id || 0), 0);
        const newReq = {
          request_id: maxId + 1,
          user_id: params[0],
          blood_group_needed: params[1],
          latitude: params[2],
          longitude: params[3],
          urgency: params[4] || 'Medium',
          quantity: params[5] || 1,
          address: params[6] || '',
          status: 'pending',
          created_at: new Date().toISOString()
        };
        db.emergency_requests.push(newReq);
        await writeDb(db);
        return { lastID: newReq.request_id };
      }
      if (query.includes('UPDATE emergency_requests SET status')) {
        const req = db.emergency_requests.find(r => r.request_id === params[0]);
        if (req) req.status = params[1] || 'matched';
        await writeDb(db);
        return { changes: 1 };
      }
      if (query.includes('INSERT INTO donation_history')) {
        const maxId = db.donation_history.reduce((max, d) => Math.max(max, d.donation_id || 0), 0);
        const newDonation = {
          donation_id: maxId + 1,
          donor_id: params[0],
          request_id: params[1],
          donation_date: new Date().toISOString()
        };
        db.donation_history.push(newDonation);
        await writeDb(db);
        return { lastID: newDonation.donation_id };
      }
      if (query.includes('UPDATE users SET last_donation_date')) {
        const user = db.users.find(u => u.user_id === params[0]);
        if (user) user.last_donation_date = new Date().toISOString();
        await writeDb(db);
        return { changes: 1 };
      }
      return { lastID: 0, changes: 0 };
    },
    exec: async (query: string) => {
      // Mock exec for table creation
      return;
    }
  };
};
