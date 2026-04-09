import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { getDb } from './src/db.ts';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createServer } from 'http';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'emergency-blood-secret-key';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = Number(process.env.PORT) || 3000;
  const db = await getDb();

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
  }));
  app.use(cookieParser());
  app.use(express.json());

  // Socket.io connection handling
  const connectedUsers = new Map<string, string>(); // user_id -> socket_id

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('register_user', (userId: string) => {
      connectedUsers.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}. Current connected users:`, Array.from(connectedUsers.keys()));
    });

    socket.on('disconnect', () => {
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          connectedUsers.delete(userId);
          console.log(`User ${userId} disconnected. Current connected users:`, Array.from(connectedUsers.keys()));
          break;
        }
      }
    });
  });

  // Haversine formula for distance calculation
  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  }

  function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  // Middleware to authenticate user
  const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post('/api/register', async (req, res) => {
    const { name, phone, password, blood_group, latitude, longitude } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      await db.run(
        'INSERT INTO users (name, phone, password, blood_group, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
        [name, phone, hashedPassword, blood_group, latitude, longitude]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Phone number already registered' });
    }
  });

  app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }
    
    const trimmedPhone = phone.trim();
    const user = await db.get('SELECT * FROM users WHERE phone = ?', [trimmedPhone]);
    
    if (user && await bcrypt.compare(password.trim(), user.password)) {
      const token = jwt.sign({ user_id: user.user_id, name: user.name }, JWT_SECRET);
      
      // In AI Studio preview, we often need secure and sameSite: none for cookies to work in iframes
      const isProduction = process.env.NODE_ENV === 'production';
      const isCloudRun = process.env.K_SERVICE !== undefined; // Check if running on Cloud Run
      
      res.cookie('token', token, { 
        httpOnly: true, 
        secure: isProduction || isCloudRun, 
        sameSite: (isProduction || isCloudRun) ? 'none' : 'lax' 
      });
      
      res.json({ 
        success: true, 
        user: { 
          user_id: user.user_id, 
          name: user.name, 
          blood_group: user.blood_group, 
          current_mode: user.current_mode 
        } 
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.post('/api/logout', (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const isCloudRun = process.env.K_SERVICE !== undefined;
    
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction || isCloudRun,
      sameSite: (isProduction || isCloudRun) ? 'none' : 'lax'
    });
    res.json({ success: true });
  });

  app.get('/api/me', authenticateToken, async (req: any, res) => {
    const user = await db.get('SELECT user_id, name, phone, blood_group, latitude, longitude, last_donation_date, is_available, current_mode FROM users WHERE user_id = ?', [req.user.user_id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If user is in patient mode, check for active emergency request
    let activeEmergency = null;
    if (user.current_mode === 'patient') {
      const latestRequest = await db.get(
        'SELECT * FROM emergency_requests WHERE user_id = ? AND status = "pending" ORDER BY created_at DESC LIMIT 1',
        [user.user_id]
      );
      
      if (latestRequest) {
        // Fetch matched donors and blood banks for this request
        const matchedDonors = await db.all(
          `SELECT user_id, name, latitude, longitude, last_donation_date, phone, address 
           FROM users 
           WHERE blood_group = ? 
           AND user_id != ? 
           AND current_mode = "donor" 
           AND is_available = 1`,
          [latestRequest.blood_group_needed, user.user_id]
        );

        const inventory = await db.all(
          'SELECT * FROM blood_bank_inventory WHERE blood_group = ? AND units_available > 0',
          [latestRequest.blood_group_needed]
        );

        const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        activeEmergency = {
          ...latestRequest,
          donors: matchedDonors.map((d: any) => ({
            ...d,
            distance: calculateDistance(user.latitude, user.longitude, d.latitude, d.longitude),
            travelTime: Math.round(calculateDistance(user.latitude, user.longitude, d.latitude, d.longitude) * 5)
          })).sort((a, b) => a.distance - b.distance).slice(0, 5),
          blood_bank: inventory.map((b: any) => ({
            ...b,
            distance: calculateDistance(user.latitude, user.longitude, b.latitude, b.longitude)
          })).sort((a, b) => (a.distance || 0) - (b.distance || 0))
        };
      }
    }

    res.json({ ...user, activeEmergency });
  });

  // Emergency Routes
  app.post('/api/emergency', authenticateToken, async (req: any, res) => {
    const user_id = req.user.user_id;

    // 1. Switch mode to patient and get up-to-date user info
    await db.run('UPDATE users SET current_mode = "patient" WHERE user_id = ?', [user_id]);
    const user = await db.get('SELECT name, phone, address FROM users WHERE user_id = ?', [user_id]);

    const { blood_group_needed, latitude, longitude, urgency = 'Medium', quantity = 1, address } = req.body;
    const finalAddress = address || user.address;

    // 2. Create emergency request
    const result = await db.run(
      'INSERT INTO emergency_requests (user_id, blood_group_needed, latitude, longitude, urgency, quantity, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, blood_group_needed, latitude, longitude, urgency, quantity, finalAddress]
    );
    const request_id = result.lastID;

    // 3. Check blood bank inventory
    const inventory = await db.all(
      'SELECT * FROM blood_bank_inventory WHERE blood_group = ? AND units_available > 0',
      [blood_group_needed]
    );

    // Notify all connected clients about the new emergency (for blood banks and donors)
    io.emit('new_emergency_request', {
      request_id,
      blood_group: blood_group_needed,
      urgency,
      quantity,
      address: finalAddress,
      latitude,
      longitude,
      requester_name: user.name
    });

    // 4. Match donors
    const donors = await db.all(
      `SELECT user_id, name, latitude, longitude, last_donation_date, phone, address 
       FROM users 
       WHERE blood_group = ? 
       AND user_id != ? 
       AND current_mode = "donor" 
       AND is_available = 1`,
      [blood_group_needed, user_id]
    );

    const now = new Date();
    const eligibilityWindowDays = 56; // Standard 8 weeks for whole blood

    const matchedDonors = donors
      .map(donor => {
        const dist = calculateDistance(latitude, longitude, donor.latitude, donor.longitude);
        // Average speed 30km/h in city
        const timeMinutes = Math.round((dist / 30) * 60);
        
        // Refined scoring algorithm to prioritize new donors and those who haven't donated in a while.
        // Lower score is better. The donationScore acts as a distance offset (in km).
        let donationScore = 0;
        if (donor.last_donation_date) {
          const lastDonation = new Date(donor.last_donation_date);
          const daysSinceLastDonation = Math.floor((now.getTime() - lastDonation.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastDonation < eligibilityWindowDays) {
            // Not eligible yet (disqualified)
            donationScore = 1000; 
          } else if (daysSinceLastDonation < 60) {
            // Eligible but very recent (56-59 days), give a penalty to prioritize those with longer recovery
            donationScore = 30;
          } else if (daysSinceLastDonation >= 180) {
            // Haven't donated in > 6 months, high priority bonus (-20km offset)
            donationScore = -20;
          } else if (daysSinceLastDonation >= 120) {
            // Haven't donated in > 4 months, medium priority bonus (-15km offset)
            donationScore = -15;
          } else if (daysSinceLastDonation >= 90) {
            // Haven't donated in > 3 months, small priority bonus (-10km offset)
            donationScore = -10;
          } else if (daysSinceLastDonation >= 60) {
            // Haven't donated in > 2 months, slight priority bonus (-5km offset)
            donationScore = -5;
          } else {
            // Standard priority
            donationScore = 0;
          }
        } else {
          // Never donated - Highest priority to encourage new donors (-25km offset)
          // This makes a new donor 30km away score better than a recent donor 6km away.
          donationScore = -25;
        }
 
        const totalScore = dist + donationScore;
        return { ...donor, distance: dist, travelTime: timeMinutes, score: totalScore };
      })
      .filter(donor => donor.score < 1000) // Filter out ineligible donors
      .sort((a, b) => a.score - b.score);

    // 5. Send real-time notifications to nearby donors (within 500km for better testing/reach)
    const nearbyDonors = matchedDonors.filter(d => d.distance <= 500);
    console.log(`Emergency Request ${request_id}: Found ${matchedDonors.length} matched donors, ${nearbyDonors.length} within 500km`);
    console.log('Matched Donors IDs:', matchedDonors.map(d => d.user_id));
    console.log('Currently Connected Users (IDs):', Array.from(connectedUsers.keys()));
    
    nearbyDonors.forEach(donor => {
      const socketId = connectedUsers.get(donor.user_id.toString());
      if (socketId) {
        console.log(`Attempting to send notification to donor ${donor.user_id} on socket ${socketId}`);
        io.to(socketId).emit('emergency_notification', {
          request_id,
          blood_group: blood_group_needed,
          distance: donor.distance.toFixed(1),
          travelTime: donor.travelTime,
          requester_name: user.name,
          requester_phone: user.phone,
          requester_address: finalAddress,
          urgency,
          quantity
        });
        console.log(`Notification sent to donor ${donor.user_id} (Socket: ${socketId})`);
      } else {
        console.log(`Donor ${donor.user_id} is matched but NOT connected via socket.`);
      }
    });

    // 6. Notify Blood Banks (Simulated)
    inventory.forEach(bank => {
      console.log(`[BLOOD BANK ALERT] Notifying ${bank.hospital_name} about emergency request ${request_id} for ${blood_group_needed}`);
      // In a real app, this would send an email, SMS, or socket event to the bank's dashboard
      io.emit('blood_bank_alert', {
        bank_id: bank.id,
        hospital_name: bank.hospital_name,
        blood_group: blood_group_needed,
        units_available: bank.units_available,
        request_id,
        urgency,
        quantity
      });
    });

    res.json({
      request_id,
      blood_group_needed,
      blood_bank: inventory.map((b: any) => ({
        ...b,
        distance: calculateDistance(latitude, longitude, b.latitude, b.longitude)
      })).sort((a, b) => (a.distance || 0) - (b.distance || 0)),
      donors: matchedDonors.slice(0, 5),
      urgency,
      quantity
    });
  });

  app.post('/api/donor-response', authenticateToken, async (req: any, res) => {
    const { request_id, response } = req.body;
    const donor_id = req.user.user_id;

    if (response === 'accept') {
      await db.run('UPDATE emergency_requests SET status = "matched" WHERE request_id = ?', [request_id]);
      await db.run(
        'INSERT INTO donation_history (donor_id, request_id) VALUES (?, ?)',
        [donor_id, request_id]
      );
      await db.run('UPDATE users SET last_donation_date = CURRENT_TIMESTAMP WHERE user_id = ?', [donor_id]);
    }

    res.json({ success: true });
  });

  app.post('/api/complete-emergency', authenticateToken, async (req: any, res) => {
    const user_id = req.user.user_id;
    await db.run('UPDATE users SET current_mode = "donor" WHERE user_id = ?', [user_id]);
    res.json({ success: true });
  });

  app.post('/api/update-location', authenticateToken, async (req: any, res) => {
    try {
      const { latitude, longitude } = req.body;
      const user_id = req.user.user_id;

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }

      await db.run('UPDATE users SET latitude = ?, longitude = ? WHERE user_id = ?', [latitude, longitude, user_id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Update location error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/update-profile', authenticateToken, async (req: any, res) => {
    const { name, phone, blood_group, current_mode } = req.body;
    const user_id = req.user.user_id;
    try {
      await db.run(
        'UPDATE users SET name = ?, phone = ?, blood_group = ?, current_mode = ? WHERE user_id = ?',
        [name, phone, blood_group, current_mode, user_id]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: 'Phone number already in use' });
    }
  });

  app.post('/api/reset-password', authenticateToken, async (req: any, res) => {
    const { currentPassword, newPassword } = req.body;
    const user_id = req.user.user_id;
    
    const user = await db.get('SELECT password FROM users WHERE user_id = ?', [user_id]);
    if (user && await bcrypt.compare(currentPassword, user.password)) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.run('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, user_id]);
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Incorrect current password' });
    }
  });

  app.post('/api/test-notification', authenticateToken, async (req: any, res) => {
    const userId = req.user.user_id.toString();
    const socketId = connectedUsers.get(userId);
    const user = await db.get('SELECT name FROM users WHERE user_id = ?', [req.user.user_id]);
    
    console.log(`Test notification requested for user ${userId}, socketId: ${socketId}`);
    if (socketId) {
      io.to(socketId).emit('emergency_notification', {
        request_id: 0,
        blood_group: 'TEST',
        distance: '0.0',
        travelTime: 0,
        requester_name: user?.name || 'Test System'
      });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Socket not connected. Please refresh.' });
    }
  });

  app.post('/api/notify-donor', authenticateToken, async (req: any, res) => {
    const { donor_id, request_id } = req.body;
    const requester_id = req.user.user_id;

    try {
      const donor = await db.get('SELECT name, latitude, longitude FROM users WHERE user_id = ?', [donor_id]);
      const request = await db.get('SELECT blood_group_needed, latitude, longitude, urgency, quantity, address FROM emergency_requests WHERE request_id = ?', [request_id]);
      const requester = await db.get('SELECT name, phone, address FROM users WHERE user_id = ?', [requester_id]);

      if (donor && request && requester) {
        const finalAddress = request.address || requester.address;
        const dist = calculateDistance(request.latitude, request.longitude, donor.latitude, donor.longitude);
        const timeMinutes = Math.round((dist / 30) * 60);

        const socketId = connectedUsers.get(donor_id.toString());
        if (socketId) {
          io.to(socketId).emit('emergency_notification', {
            request_id,
            blood_group: request.blood_group_needed,
            distance: dist.toFixed(1),
            travelTime: timeMinutes,
            requester_name: requester.name,
            requester_phone: requester.phone,
            requester_address: finalAddress,
            urgency: request.urgency,
            quantity: request.quantity
          });
          console.log(`Manual alert sent to donor ${donor_id} from requester ${requester_id}`);
          res.json({ success: true });
        } else {
          // For demo/dev purposes, if the donor exists but is offline, we can still simulate a "success" 
          // but log that it was simulated. This helps the user see the UI working.
          console.log(`[SIMULATED ALERT] Donor ${donor_id} is offline. Alert would have been sent.`);
          res.json({ 
            success: true, 
            simulated: true, 
            message: 'Alert simulated (Donor is currently offline)' 
          });
        }
      } else {
        res.status(404).json({ error: 'Donor or request not found' });
      }
    } catch (error) {
      console.error('Error sending manual alert:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/donor-profile/:id', authenticateToken, async (req: any, res) => {
    const donor_id = parseInt(req.params.id);
    const donor = await db.get('SELECT user_id, name, blood_group, last_donation_date, address FROM users WHERE user_id = ?', [donor_id]);
    
    if (!donor) return res.status(404).json({ error: 'Donor not found' });
    
    const stats = await db.get('SELECT COUNT(*) FROM donation_history WHERE donor_id = ?', [donor_id]);
    
    res.json({
      ...donor,
      total_donations: stats?.total_donations || 0
    });
  });

  app.get('/api/blood-banks', async (req, res) => {
    const banks = await db.all('SELECT * FROM blood_bank_inventory');
    res.json(banks);
  });

  app.post('/api/blood-bank/inventory', authenticateToken, async (req, res) => {
    const { bank_id, blood_group, units_available } = req.body;
    
    const result = await db.run(
      'UPDATE blood_bank_inventory SET units_available = ? WHERE id = ? AND blood_group = ?',
      [units_available, bank_id, blood_group]
    );

    if (result.changes > 0) {
      // Broadcast inventory update to all clients
      io.emit('inventory_updated', { bank_id, blood_group, units_available });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Blood bank or blood group not found' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled Express Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
