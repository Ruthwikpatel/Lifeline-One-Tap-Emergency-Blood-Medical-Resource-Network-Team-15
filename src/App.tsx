/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Heart, 
  User, 
  Phone, 
  MapPin, 
  Mic, 
  AlertCircle, 
  CheckCircle, 
  LogOut, 
  Activity, 
  Droplet,
  Navigation,
  Clock,
  Map as MapIcon,
  Info,
  Settings,
  X,
  Lock,
  Shield,
  ExternalLink,
  Radio,
  Sun,
  Moon,
  Hospital
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { translations, Language } from './translations';

// Fix for default marker icons in Leaflet with React/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom icons for different marker types
const patientIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const donorIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const bloodBankIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Helper component to center map when location changes
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center[0], center[1], map]);
  return null;
}

// Types
interface UserData {
  user_id: number;
  name: string;
  phone: string;
  blood_group: string;
  latitude: number;
  longitude: number;
  current_mode: 'donor' | 'patient';
  is_available: boolean;
  last_donation_date: string | null;
}

interface EmergencyRequest {
  request_id: number;
  blood_group_needed: string;
  donors: any[];
  blood_bank: any[];
  urgency?: string;
  quantity?: number;
}

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [emergency, setEmergency] = useState<EmergencyRequest | null>(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyFormData, setEmergencyFormData] = useState({
    bloodGroup: '',
    urgency: 'Medium',
    quantity: 1,
    address: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceConfirmationData, setVoiceConfirmationData] = useState<any>(null);
  const [isListeningForConfirmation, setIsListeningForConfirmation] = useState(false);
  const [isListeningForDonorConfirmation, setIsListeningForDonorConfirmation] = useState(false);
  const [showVoiceConfirmationModal, setShowVoiceConfirmationModal] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Initialize Gemini AI
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  useEffect(() => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not set. Voice features will be disabled.');
    }
  }, []);

  // TTS Helper Function
  const speakText = async (text: string) => {
    if (!text || isSpeaking || !process.env.GEMINI_API_KEY) return;
    
    try {
      setIsSpeaking(true);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768;
        }
        
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error('TTS Error:', err);
      setIsSpeaking(false);
    }
  };

  const [pendingDonorResponse, setPendingDonorResponse] = useState<'accept' | 'decline' | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const socket = useRef<any>(null);
  const [notification, setNotification] = useState<any>(null);
  const [showUrgencyOverlay, setShowUrgencyOverlay] = useState(false);
  const [emergencyAlert, setEmergencyAlert] = useState<any>(null);
  const [alertingDonorId, setAlertingDonorId] = useState<string | null>(null);
  const [selectedDonorProfile, setSelectedDonorProfile] = useState<any>(null);
  const [isFetchingDonorProfile, setIsFetchingDonorProfile] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [bloodBanks, setBloodBanks] = useState<any[]>([]);
  const [isBloodBankModalOpen, setIsBloodBankModalOpen] = useState(false);

  const t = translations[language];

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    blood_group: 'O+',
    latitude: 0,
    longitude: 0
  });

  const [profileData, setProfileData] = useState({
    name: '',
    phone: '',
    blood_group: '',
    current_mode: 'donor'
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name,
        phone: user.phone,
        blood_group: user.blood_group,
        current_mode: user.current_mode
      });
    }
  }, [user]);

  const fetchBloodBanks = async () => {
    try {
      const res = await fetch('/api/blood-banks');
      if (res.ok) {
        const data = await res.json();
        setBloodBanks(data);
      }
    } catch (err) {
      console.error('Failed to fetch blood banks:', err);
      setError(t.networkError);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchBloodBanks();
    
    // Request notification permission
    if ("Notification" in window) {
      Notification.requestPermission();
    }
    
    // Initialize Socket.IO
    socket.current = io(window.location.origin);
    
    socket.current.on('emergency_notification', (data: any) => {
      setNotification(data);
      setEmergencyAlert(data);
      setShowUrgencyOverlay(true);
      
      // Automatically start voice recognition for donor confirmation
      setIsListeningForDonorConfirmation(true);
      setTimeout(() => {
        startVoiceRecognition();
      }, 2000); // Give user a moment to see the alert
      
      // Browser notification
      console.log('Notification.permission:', Notification.permission);
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(t.emergencyAlertTitle, {
            body: t.emergencyAlertBody
              .replace('{{urgency}}', t[data.urgency.toLowerCase() as keyof typeof t] || data.urgency)
              .replace('{{quantity}}', data.quantity.toString())
              .replace('{{bloodGroup}}', data.blood_group)
              .replace('{{distance}}', data.distance.toString())
              .replace('{{travelTime}}', data.travelTime.toString()),
            icon: "/favicon.ico",
            tag: "emergency-alert"
          });
          console.log('Browser notification sent successfully');
        } catch (err) {
          console.error('Error creating browser notification:', err);
        }
      } else {
        console.log('Browser notification NOT sent. Permission state:', Notification.permission);
      }
      
      // Sound alert
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log('Audio play failed', e));
    });

    socket.current.on('new_emergency_request', (data: any) => {
      console.log('New emergency request broadcast:', data);
      // This could be used by blood banks to see incoming requests in real-time
    });

    socket.current.on('inventory_updated', (data: any) => {
      fetchBloodBanks();
      // If user is currently viewing an emergency, refresh their data
      if (user?.current_mode === 'patient') {
        fetchUser();
      }
    });

    socket.current.on('blood_bank_alert', (data: any) => {
      // Show confirmation if blood bank has sufficient units
      if (data.units_available >= (user?.active_emergency?.quantity || 1)) {
        setProfileSuccess(t.hospitalConfirmed
          .replace('{{hospitalName}}', data.hospital_name)
          .replace('{{bloodGroup}}', data.blood_group)
        );
        setTimeout(() => setProfileSuccess(''), 5000);
      }
    });

    // Get initial geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
      });
    }
  }, []);

  // Periodic location update
  useEffect(() => {
    if (!user) return;

    const updateLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          
          if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            console.warn('Invalid coordinates received from geolocation');
            return;
          }

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const res = await fetch('/api/update-location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ latitude, longitude }),
              credentials: 'include',
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (res.ok) {
              // Only update if coordinates changed significantly (> 0.0001 deg ~ 11m)
              setUser(prev => {
                if (!prev) return null;
                const latDiff = Math.abs(prev.latitude - latitude);
                const lngDiff = Math.abs(prev.longitude - longitude);
                if (latDiff < 0.0001 && lngDiff < 0.0001) return prev;
                return { ...prev, latitude, longitude };
              });
            } else {
              const errorData = await res.json().catch(() => ({}));
              console.error('Location update server error:', res.status, errorData);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              console.warn('Location update request timed out');
            } else {
              console.error('Failed to update location (network error):', err.message || err);
            }
          }
        }, (error) => {
          console.warn('Geolocation error:', error.message);
        }, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      }
    };

    updateLocation();
    const interval = setInterval(updateLocation, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [user?.user_id]);

  useEffect(() => {
    if (user && socket.current) {
      const register = () => {
        console.log('Registering user:', user.user_id);
        socket.current?.emit('register_user', user.user_id.toString());
      };

      if (socket.current.connected) {
        register();
      }

      socket.current.on('connect', register);
      return () => {
        socket.current?.off('connect', register);
      };
    }
  }, [user?.user_id]);

  const sendTestNotification = () => {
    // Trigger browser notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(t.testNotificationTitle, {
        body: t.notificationPermissionGranted,
        icon: "/favicon.ico"
      });
    }
    
    // Trigger in-app overlay as a fallback/test
    setEmergencyAlert({
      blood_group: user?.blood_group || 'O+',
      urgency: 'Critical',
      quantity: 1,
      distance: 0.5,
      travelTime: 5,
      requester_name: 'System Test',
      requester_phone: '1234567890',
      requester_address: 'Your Current Location',
      request_id: 'test-id'
    });
    setShowUrgencyOverlay(true);
    setProfileSuccess(t.thankYou);
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      // Check if we are in an iframe
      const isInIframe = window.self !== window.top;
      
      const permission = await Notification.requestPermission();
      console.log('Notification permission requested. Result:', permission);
      
      if (permission === 'granted') {
        setProfileSuccess(t.notificationPermissionGranted);
        setProfileError('');
      } else if (permission === 'denied') {
        if (isInIframe) {
          setProfileError(t.notificationPermissionBlocked);
        } else {
          setProfileError(t.notificationPermissionBlocked);
        }
      }
    } else {
      setProfileError(t.notificationsNotSupported);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.activeEmergency) {
          setEmergency(data.activeEmergency);
        }
      } else if (res.status === 401) {
        // Normal state: user is not logged in yet
      }
    } catch (err) {
      // Network or other unexpected errors
      console.log('Session check skipped (offline or server starting)');
    } finally {
      setLoading(false);
    }
  };

  const fetchDonorProfile = async (donorId: number) => {
    setIsFetchingDonorProfile(true);
    try {
      const res = await fetch(`/api/donor-profile/${donorId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSelectedDonorProfile(data);
      } else {
        setProfileError(t.failedToFetchDonorProfile);
        setTimeout(() => setProfileError(''), 3000);
      }
    } catch (err) {
      setProfileError(t.networkError);
      setTimeout(() => setProfileError(''), 3000);
    } finally {
      setIsFetchingDonorProfile(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setProfileSuccess('');
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone: formData.phone.trim(), 
          password: formData.password.trim() 
        }),
        credentials: 'include'
      });
      if (res.ok) {
        await fetchUser();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.invalidLogin);
      }
    } catch (err) {
      setError(t.networkError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setProfileSuccess('');
    setIsSubmitting(true);
    
    let currentFormData = { 
      ...formData,
      phone: formData.phone.trim(),
      password: formData.password.trim()
    };
    
    // Try to get location one last time if it's still 0
    if (currentFormData.latitude === 0 && currentFormData.longitude === 0 && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        currentFormData.latitude = position.coords.latitude;
        currentFormData.longitude = position.coords.longitude;
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
      } catch (err) {
        console.log('Could not get location for registration, proceeding with default');
      }
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFormData),
        credentials: 'include'
      });
      if (res.ok) {
        setIsLogin(true);
        setProfileSuccess(t.registrationSuccess);
        setError('');
        // Clear registration specific fields but keep phone for easier login
        setFormData(prev => ({
          ...prev,
          name: '',
          password: ''
        }));
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.registrationFailed);
      }
    } catch (err) {
      setError(t.networkError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout fetch failed:', err);
    }
    setUser(null);
    setSelectedDonorProfile(null);
    setError('');
    setProfileSuccess('');
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    try {
      const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
        credentials: 'include'
      });
      if (res.ok) {
        setProfileSuccess(t.profileUpdateSuccess);
        
        // If mode changed to patient, trigger emergency automatically
        if (profileData.current_mode === 'patient' && user?.current_mode === 'donor') {
          triggerEmergency();
        }
        
        fetchUser();
      } else {
        const data = await res.json();
        setProfileError(data.error || t.profileUpdateFailed);
      }
    } catch (err) {
      setProfileError(t.networkError);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setProfileError(t.passwordsDoNotMatch);
      return;
    }
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        }),
        credentials: 'include'
      });
      if (res.ok) {
        setProfileSuccess(t.passwordResetSuccess);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setIsResettingPassword(false);
      } else {
        const data = await res.json();
        setProfileError(data.error || t.passwordResetFailed);
      }
    } catch (err) {
      setProfileError(t.networkError);
    }
  };

  const triggerEmergency = async (bloodGroup?: string, urgency?: string, quantity?: number, address?: string) => {
    if (!user?.latitude || !user?.longitude || (user.latitude === 0 && user.longitude === 0)) {
      const msg = t.locationRequired;
      setError(msg);
      return;
    }

    try {
      const bg = bloodGroup || emergencyFormData.bloodGroup || user?.blood_group;
      const urg = urgency || emergencyFormData.urgency;
      const qty = quantity || emergencyFormData.quantity;
      const addr = address || emergencyFormData.address;
      
      setRequestStatus(t.searchingDonors);
      setShowEmergencyModal(false);
      setShowVoiceConfirmationModal(false);
      
      const res = await fetch('/api/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blood_group_needed: bg,
          latitude: user?.latitude,
          longitude: user?.longitude,
          urgency: urg,
          quantity: qty,
          address: addr
        }),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        
        setRequestStatus(t.matchingBanks);
        
        setTimeout(() => {
          setRequestStatus(t.banksNotified);
          
          setTimeout(() => {
            setRequestStatus(t.assistanceEnRoute);
            setEmergency(data);
            fetchUser(); // Update mode
            
            // Clear status after a delay
            setTimeout(() => setRequestStatus(null), 3000);
            
            if (data.donors && data.donors.length > 0) {
              setProfileSuccess(t.emergencyRequestSentWithDonors.replace('{{count}}', data.donors.length.toString()));
            } else {
              setProfileSuccess(t.emergencyRequestSentCheckingBanks);
            }
            setTimeout(() => setProfileSuccess(''), 5000);
          }, 1500);
        }, 1500);
      } else {
        setRequestStatus(null);
        const data = await res.json();
        const errorMsg = data.error || t.emergencyRequestFailed;
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = t.networkError;
      setError(errorMsg);
      console.error(err);
    }
  };

  const completeEmergency = async () => {
    try {
      await fetch('/api/complete-emergency', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Complete emergency fetch failed:', err);
    }
    setEmergency(null);
    setRequestStatus(null);
    fetchUser();
  };

  const handleDonorResponse = async (response: 'accept' | 'decline', confirmedByVoice = false) => {
    if (!notification) return;
    
    // If we are not already in a confirmation flow, start one
    if (!confirmedByVoice) {
      console.log(`Starting voice confirmation for donor response: ${response}`);
      setPendingDonorResponse(response);
      setIsListeningForDonorConfirmation(true);
      setProfileSuccess(t.confirmActionPrompt.replace('{{action}}', response === 'accept' ? t.accept : t.decline));
      
      // Give the user a moment to hear/read the prompt before starting recognition
      setTimeout(() => {
        startVoiceRecognition();
      }, 1500);
      return;
    }
    
    try {
      await fetch('/api/donor-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: notification.request_id,
          response
        }),
        credentials: 'include'
      });
      
      setNotification(null);
      setPendingDonorResponse(null);
      if (response === 'accept') {
        setProfileSuccess(t.thankYou);
        setTimeout(() => setProfileSuccess(''), 5000);
      }
    } catch (err) {
      console.error('Failed to send donor response:', err);
      setProfileError(t.networkError);
    }
  };

  const startVoiceRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(t.voiceNotSupported);
      return;
    }

    const recognition = new SpeechRecognition();
    
    // Map internal language codes to BCP 47 tags
    const langMap: Record<string, string> = {
      en: 'en-IN',
      te: 'te-IN',
      hi: 'hi-IN',
      ta: 'ta-IN',
      ml: 'ml-IN'
    };
    
    recognition.lang = langMap[language] || 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      console.log('Speech recognition started for language:', recognition.lang);
      setIsListening(true);
      setVoiceTranscript('');
      setInterimTranscript('');
      setError('');
    };

    recognition.onresult = async (event: any) => {
      let finalTranscript = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      if (currentInterim) {
        setInterimTranscript(currentInterim);
      }

      if (!finalTranscript) return;

      const transcript = finalTranscript;
      console.log('Voice Transcript Recognized:', transcript);
      setVoiceTranscript(transcript);
      setInterimTranscript('');
      setIsListening(false);
      
      // If we are listening for donor confirmation
      if (isListeningForDonorConfirmation && emergencyAlert) {
        console.log('Processing donor confirmation for:', emergencyAlert);
        const lowerTranscript = transcript.toLowerCase();
        const yesKeywords = [
          "yes", "confirm", "correct", "yeah", "yep", "ok", "okay",
          "avunu", "sare", "అవును", "సరే",
          "haan", "sahi", "theek", "हाँ", "सही", "ठीक",
          "aam", "sari", "ஆம்", "சரி",
          "athe", "അതെ", "ശരി"
        ];
        const noKeywords = [
          "no", "cancel", "wrong", "nope", "stop",
          "kaadu", "vaddu", "కాదు", "వద్దు",
          "nahi", "galat", "नहीं", "गलत",
          "illai", "இல்லை",
          "alla", "അല്ല"
        ];

        const isYes = yesKeywords.some(k => lowerTranscript.includes(k));
        const isNo = noKeywords.some(k => lowerTranscript.includes(k));

        if (isYes) {
          console.log('Donor confirmed via voice.');
          const responseToConfirm = pendingDonorResponse || 'accept';
          handleDonorResponse(responseToConfirm, true);
          setShowUrgencyOverlay(false);
          setIsListeningForDonorConfirmation(false);
          setPendingDonorResponse(null);
          setVoiceTranscript('');
          speakText(t.thankYou);
        } else if (isNo) {
          if (pendingDonorResponse) {
            console.log('Donor cancelled the action.');
            setPendingDonorResponse(null);
            setIsListeningForDonorConfirmation(false);
            setProfileSuccess(t.actionCancelled);
            speakText(t.actionCancelled);
            setTimeout(() => setProfileSuccess(''), 3000);
          } else {
            console.log('Donor declined via voice.');
            handleDonorResponse('decline', true);
            setShowUrgencyOverlay(false);
            setIsListeningForDonorConfirmation(false);
            setVoiceTranscript('');
            speakText(t.actionCancelled);
          }
        } else {
          console.log('Unclear donor confirmation. Asking again.');
          setError(t.pleaseSayYesNo);
          speakText(t.pleaseSayYesNo);
          // Restart listening for donor confirmation
          setTimeout(() => startVoiceRecognition(), 2000);
        }
        return;
      }

      // If we are listening for confirmation (patient side)
      if (isListeningForConfirmation && voiceConfirmationData) {
        console.log('Processing confirmation for:', voiceConfirmationData);
        const lowerTranscript = transcript.toLowerCase();
        const yesKeywords = [
          "yes", "confirm", "correct", "yeah", "yep", "ok", "okay",
          "avunu", "sare", "అవును", "సరే",
          "haan", "sahi", "theek", "हाँ", "सही", "ठीक",
          "aam", "sari", "ஆம்", "சரி",
          "athe", "അതെ", "ശരി"
        ];
        const noKeywords = [
          "no", "cancel", "wrong", "nope", "stop",
          "kaadu", "vaddu", "కాదు", "వద్దు",
          "nahi", "galat", "नहीं", "गलत",
          "illai", "இல்லை",
          "alla", "അല്ല"
        ];

        const isYes = yesKeywords.some(k => lowerTranscript.includes(k));
        const isNo = noKeywords.some(k => lowerTranscript.includes(k));

        if (isYes) {
          console.log('User confirmed via voice. Triggering emergency.');
          triggerEmergency(
            voiceConfirmationData.blood_group,
            voiceConfirmationData.urgency,
            voiceConfirmationData.quantity,
            voiceConfirmationData.address
          );
          setVoiceConfirmationData(null);
          setIsListeningForConfirmation(false);
          setShowVoiceConfirmationModal(false);
          setVoiceTranscript('');
          speakText(t.voiceRequestSuccess);
        } else if (isNo) {
          console.log('User cancelled via voice.');
          setVoiceConfirmationData(null);
          setIsListeningForConfirmation(false);
          setShowVoiceConfirmationModal(false);
          setVoiceTranscript('');
          setProfileSuccess(t.actionCancelled);
          speakText(t.voiceRequestCancelled);
          setTimeout(() => setProfileSuccess(''), 3000);
        } else {
          console.log('Unclear confirmation. Asking again.');
          setError(t.pleaseSayYesNo);
          speakText(t.pleaseSayYesNo);
          // Restart listening for confirmation
          setTimeout(() => startVoiceRecognition(), 2000);
        }
        return;
      }

      setIsProcessingVoice(true);
      setVoiceTranscript(''); // Clear for processing message
      
      if (!process.env.GEMINI_API_KEY) {
        setError("Gemini API Key is missing. Please set it in your .env file for voice features to work.");
        setIsProcessingVoice(false);
        return;
      }

      try {
        // CALL GEMINI DIRECTLY FROM FRONTEND
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{
            parts: [{
              text: `Extract blood request details from this emergency voice transcript: "${transcript}".
              The transcript may contain mixed languages (English, Telugu, Hindi, Tamil, Malayalam).
              
              Extraction Rules:
              1. Blood Group: Map to standard format (O+, O-, A+, A-, B+, B-, AB+, AB-).
                 - Handle phonetics: "O positive" -> "O+", "A negative" -> "A-".
                 - Handle local scripts/phonetics: "ఓ పాజిటివ్" -> "O+", "ఏ నెగటివ్" -> "A-".
              2. Urgency: Map to "Critical", "High", or "Medium".
                 - "Urgent", "Emergency", "Immediate", "Pranam pramadham" -> "Critical"
                 - "Soon", "Quickly", "Thondaraga", "Jaldi" -> "High"
                 - Default to "Medium".
              3. Quantity: Units of blood (integer). Default to 1.
              4. Address/Landmark: Any location mentioned.
              5. Confidence: 0.0 to 1.0 score.
              
              Return JSON: { "blood_group": string|null, "urgency": string, "quantity": number, "address": string|null, "confidence_score": number }`
            }]
          }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                blood_group: { type: Type.STRING },
                urgency: { type: Type.STRING },
                quantity: { type: Type.INTEGER },
                address: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER }
              }
            }
          }
        });

        const data = JSON.parse(response.text || '{}');
        console.log('AI Processed Voice Data (Frontend):', data);
        
        if (data.confidence_score !== undefined && data.confidence_score < 0.5) {
          setError(t.voiceLowConfidence);
          speakText(t.voiceLowConfidence);
          return;
        }

        if (data.blood_group) {
          setVoiceConfirmationData(data);
          setIsListeningForConfirmation(true);
          setShowVoiceConfirmationModal(true);
          
          const prompt = t.voiceConfirmPromptWithDetails
            .replace('{{bloodGroup}}', data.blood_group)
            .replace('{{urgency}}', t[data.urgency.toLowerCase() as keyof typeof t] || data.urgency);
          
          speakText(prompt);
          
          // Automatically start listening for confirmation after TTS finishes (approx delay)
          setTimeout(() => {
            startVoiceRecognition();
          }, 4000);
        } else {
          setError(t.voiceNoBloodGroup);
          speakText(t.voiceNoBloodGroup);
        }
      } catch (err) {
        console.error('Error processing voice:', err);
        setError(t.errorProcessingVoice);
      } finally {
        setIsProcessingVoice(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech Recognition Error:', event.error);
      setIsListening(false);
      
      if (event.error === 'not-allowed') {
        setError(t.micAccessDenied);
      } else if (event.error === 'no-speech') {
        setError(t.noSpeechDetected);
      } else if (event.error === 'network') {
        setError(t.voiceNetworkError);
      } else if (event.error === 'audio-capture') {
        setError(t.noMicFound);
      } else {
        setError(t.voiceRecognitionError + ': ' + event.error);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError(t.couldNotStartVoice);
      setIsListening(false);
    }
  };

  const testNotification = async () => {
    setProfileError('');
    setProfileSuccess('');
    
    let permissionGranted = true;
    if ("Notification" in window) {
      if (Notification.permission !== "granted") {
        try {
          const permission = await Notification.requestPermission();
          permissionGranted = (permission === "granted");
        } catch (err) {
          console.error('Notification permission error:', err);
          permissionGranted = false;
        }
      }
    }

    try {
      const res = await fetch('/api/test-notification', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        setProfileError(data.error);
      } else {
        if (!permissionGranted) {
          setProfileSuccess(t.testAlertSentBlocked);
        } else {
          setProfileSuccess(t.testAlertSent);
        }
        setTimeout(() => setProfileSuccess(''), 5000);
      }
    } catch (err) {
      setProfileError(t.failedToSendTestAlert);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950 dark:text-white transition-colors duration-300">{t.loading}</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100 dark:border-slate-800"
        >
          <div className="flex justify-between items-center mb-6">
            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full">
              <Heart className="w-8 h-8 text-red-600 fill-red-600" />
            </div>
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">{t.appName}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8">{t.tagline}</p>

          <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.fullName}</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                  <input 
                    type="text" 
                    required 
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                    placeholder={t.namePlaceholder}
                    value={formData.name}
                    onChange={e => setFormData(prev => ({...prev, name: e.target.value}))}
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.phone}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input 
                  type="tel" 
                  required 
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                  placeholder={t.phonePlaceholder}
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({...prev, phone: e.target.value}))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.password}</label>
              <input 
                type="password" 
                required 
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                placeholder={t.passwordPlaceholder}
                value={formData.password}
                onChange={e => setFormData(prev => ({...prev, password: e.target.value}))}
              />
            </div>
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.bloodGroup}</label>
                <select 
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                  value={formData.blood_group}
                  onChange={e => setFormData(prev => ({...prev, blood_group: e.target.value}))}
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg, i) => (
                    <option key={`bg-opt-1-${bg}-${i}`} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
            )}
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg"
              >
                <p className="text-red-600 dark:text-red-400 text-sm text-center font-medium">{error}</p>
              </motion.div>
            )}
            {profileSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 rounded-lg"
              >
                <p className="text-emerald-600 dark:text-emerald-400 text-sm text-center font-medium">{profileSuccess}</p>
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={isSubmitting}
              className={`w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-lg shadow-red-200 dark:shadow-none flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                  {isLogin ? t.loggingIn || 'Logging in...' : t.registering || 'Registering...'}
                </>
              ) : (
                isLogin ? t.login : t.register
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setProfileSuccess('');
              }}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              {isLogin ? t.noAccount : t.hasAccount}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <AnimatePresence key="main-overlay-presence">
        {notification && (
          <div key="notification-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              key="notification-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-4 border-red-500"
            >
              <div className="bg-red-600 p-6 text-white text-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <AlertCircle className="w-10 h-10" />
                </motion.div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.emergencyAlert}</h2>
                <p className="text-red-100 font-medium">{t.nearbyRequest}</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">{t.bloodGroup}</p>
                    <p className="text-3xl font-black text-red-600">{notification.blood_group}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">{t.distance}</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">{notification.distance} <span className="text-sm">{t.km}</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <Clock className="w-5 h-5 text-red-500" />
                  <span className="font-medium">{t.estimatedTravelTime}: <span className="font-bold text-slate-900 dark:text-white">{notification.travelTime} {t.mins}</span></span>
                </div>

                {notification.requester_name && (
                  <div className="text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {t.requestedBy}: <span className="text-slate-900 dark:text-white font-bold">{notification.requester_name}</span>
                  </div>
                )}

                <div className="flex gap-4 pt-2">
                  {notification.request_id === 0 ? (
                    <button 
                      onClick={() => setNotification(null)}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white px-6 py-4 rounded-2xl font-bold shadow-lg transition-all"
                    >
                      {t.closeTestAlert}
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleDonorResponse('decline')}
                        className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                      >
                        {t.decline}
                      </button>
                      <button 
                        onClick={() => handleDonorResponse('accept')}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-2xl font-bold shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-5 h-5" />
                        {t.accept}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

      {/* Urgency Overlay and Alert Modal */}
      <AnimatePresence key="urgency-presence">
        {showUrgencyOverlay && emergencyAlert && (
          <motion.div 
            key="urgency-overlay-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            {/* Pulsing Red Background */}
            <motion.div 
              animate={{ 
                backgroundColor: ['rgba(220, 38, 38, 0.1)', 'rgba(220, 38, 38, 0.3)', 'rgba(220, 38, 38, 0.1)'] 
              }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute inset-0 backdrop-blur-sm"
              onClick={() => {
                setShowUrgencyOverlay(false);
                setIsListeningForDonorConfirmation(false);
              }}
            />
            
            {/* Alert Modal */}
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative z-10 border-4 border-red-600"
            >
              <div className="bg-red-600 p-6 text-white text-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="inline-block mb-2"
                >
                  <AlertCircle className="w-16 h-16" />
                </motion.div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">{t.emergencyAlert}</h2>
                <p className="text-red-100 font-bold">{t.nearbyRequestDescription}</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-900/30">
                  <div>
                    <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">{t.bloodGroupNeeded}</p>
                    <p className="text-4xl font-black text-red-700 dark:text-red-500">{emergencyAlert.blood_group}</p>
                  </div>
                  <div className="text-right">
                    <div className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter mb-2 inline-block">
                      {t.etaMins.replace('{{mins}}', emergencyAlert.travelTime.toString())}
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.requester}</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{emergencyAlert.requester_name}</p>
                    {emergencyAlert.requester_phone && (
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">{emergencyAlert.requester_phone}</p>
                    )}
                  </div>
                </div>
                
                {emergencyAlert.requester_address && (
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{t.pickupLocation}</p>
                    <div className="flex items-start gap-2 text-slate-900 dark:text-slate-200">
                      <MapPin className="w-4 h-4 text-red-600 mt-1" />
                      <span className="text-sm font-medium">{emergencyAlert.requester_address}</span>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl border ${
                    emergencyAlert.urgency === 'Critical' 
                      ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/30' 
                      : emergencyAlert.urgency === 'High'
                      ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-900/30'
                      : 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700'
                  }`}>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{t.urgency}</p>
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <AlertCircle className={`w-4 h-4 ${
                        emergencyAlert.urgency === 'Critical' ? 'text-red-600' : 'text-orange-600'
                      }`} />
                      <span className={`text-lg font-bold ${
                        emergencyAlert.urgency === 'Critical' ? 'text-red-700 dark:text-red-500' : ''
                      }`}>{t[emergencyAlert.urgency.toLowerCase() as keyof typeof t] || emergencyAlert.urgency}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{t.extractedQuantity}</p>
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <Droplet className="w-4 h-4 text-red-600" />
                      <span className="text-lg font-bold">{t.unitsCount.replace('{{count}}', emergencyAlert.quantity.toString())}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{t.distance}</p>
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <Navigation className="w-4 h-4 text-red-600" />
                      <span className="text-lg font-bold">{t.kmCount.replace('{{count}}', emergencyAlert.distance.toString())}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{t.requestStatus}</p>
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <Activity className="w-4 h-4 text-red-600" />
                      <span className="text-lg font-bold">{t.active}</span>
                    </div>
                  </div>
                </div>

                {/* Voice Confirmation Status for Donor */}
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <AnimatePresence mode="wait">
                      {isListening ? (
                        <motion.div 
                          key="listening-waves"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-1 h-6"
                        >
                          {[0.1, 0.2, 0.3, 0.4, 0.5].map((delay, i) => (
                            <motion.div
                              key={`wave-${i}`}
                              animate={{ height: [4, 16, 4] }}
                              transition={{ duration: 0.6, repeat: Infinity, delay }}
                              className="w-1 bg-red-600 rounded-full"
                            />
                          ))}
                        </motion.div>
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                      )}
                    </AnimatePresence>
                    <span className={`text-sm font-bold ${isListening ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                      {isListening ? t.listening : t.donorVoiceConfirmPrompt}
                    </span>
                  </div>
                  
                  {voiceTranscript && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30 text-xs italic text-red-600 dark:text-red-400 text-center w-full"
                    >
                      "{voiceTranscript}"
                    </motion.div>
                  )}
                  
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-widest">{t.donorVoiceConfirmHelp}</p>
                  
                  {!isListening && (
                    <button 
                      onClick={() => {
                        setIsListeningForDonorConfirmation(true);
                        startVoiceRecognition();
                      }}
                      className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                      <Mic className="w-3 h-3" />
                      {t.retryVoice}
                    </button>
                  )}
                </div>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setShowUrgencyOverlay(false);
                      setIsListeningForDonorConfirmation(false);
                    }}
                    className="flex-1 py-4 px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-all"
                  >
                    {t.ignore}
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        await fetch('/api/donor-response', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            request_id: emergencyAlert.request_id,
                            response: 'accept'
                          }),
                          credentials: 'include'
                        });
                        setShowUrgencyOverlay(false);
                        setIsListeningForDonorConfirmation(false);
                        setProfileSuccess(t.thankYouResponseSent);
                        setTimeout(() => setProfileSuccess(''), 5000);
                      } catch (err) {
                        console.error('Error responding to emergency:', err);
                      }
                    }}
                    className="flex-2 py-4 px-8 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Droplet className="w-5 h-5" />
                    {t.iCanHelp}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

        {isBloodBankModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Hospital className="w-5 h-5 text-red-600" />
                  {t.manageInventory}
                </h2>
                <button 
                  onClick={() => setIsBloodBankModalOpen(false)}
                  className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {bloodBanks.length === 0 ? (
                  <div className="text-center py-12">
                    <Hospital className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">No blood banks found in the system.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bloodBanks.map((bank) => (
                      <div key={`bank-inv-${bank.id}-${bank.blood_group}`} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm">{bank.hospital_name}</h3>
                            <p className="text-xs text-slate-500">{bank.address}</p>
                          </div>
                          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-black rounded-md">
                            {bank.blood_group}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] uppercase font-black text-slate-400 mb-1">{t.unitsAvailable}</label>
                            <input 
                              type="number"
                              min="0"
                              className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg text-sm outline-none focus:ring-1 focus:ring-red-500"
                              value={bank.units_available}
                              onChange={async (e) => {
                                const val = e.target.value;
                                const newVal = parseInt(val) || 0;
                                
                                console.log(`Updating inventory for bank ${bank.id}, group ${bank.blood_group} to ${newVal}`);
                                
                                // Optimistic update
                                setBloodBanks(prev => prev.map(b => 
                                  (b.id === bank.id && b.blood_group === bank.blood_group) 
                                    ? { ...b, units_available: newVal } 
                                    : b
                                ));

                                try {
                                  const res = await fetch('/api/blood-bank/inventory', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      bank_id: bank.id,
                                      blood_group: bank.blood_group,
                                      units_available: newVal
                                    }),
                                    credentials: 'include'
                                  });
                                  
                                  if (!res.ok) {
                                    const errData = await res.json();
                                    console.error('Failed to update inventory:', errData);
                                    // Revert on error
                                    fetchBloodBanks();
                                    setProfileError(`Failed to update inventory: ${errData.error || 'Unknown error'}`);
                                    setTimeout(() => setProfileError(''), 3000);
                                  } else {
                                    console.log('Inventory updated successfully');
                                  }
                                } catch (err) {
                                  console.error('Failed to update inventory:', err);
                                  fetchBloodBanks();
                                  setProfileError("Network error. Please check your connection.");
                                  setTimeout(() => setProfileError(''), 3000);
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showEmergencyModal && (
          <div key="emergency-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              key="emergency-modal-content"
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-red-600 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6" />
                  <h2 className="text-xl font-bold">{t.newEmergencyRequest}</h2>
                </div>
                <button onClick={() => setShowEmergencyModal(false)} className="p-1 hover:bg-white/20 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">{t.bloodGroupNeeded}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg, i) => (
                      <button
                        key={`bg-btn-${bg}-${i}`}
                        onClick={() => setEmergencyFormData(prev => ({ ...prev, bloodGroup: bg }))}
                        className={`py-3 rounded-xl font-bold transition-all border-2 ${
                          emergencyFormData.bloodGroup === bg 
                            ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' 
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-red-200'
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">{t.urgencyLevel}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id: 'Critical', label: t.critical}, {id: 'High', label: t.high}, {id: 'Medium', label: t.medium}].map((urg, i) => (
                      <button
                        key={`urg-btn-${urg.id}-${i}`}
                        onClick={() => setEmergencyFormData(prev => ({ ...prev, urgency: urg.id }))}
                        className={`py-3 rounded-xl font-bold transition-all border-2 ${
                          emergencyFormData.urgency === urg.id 
                            ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' 
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-red-200'
                        }`}
                      >
                        {urg.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">{t.quantityUnits}</label>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setEmergencyFormData(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                      className="w-12 h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xl hover:border-red-200 dark:hover:border-red-500 dark:text-white"
                    >
                      -
                    </button>
                    <div className="flex-1 bg-slate-50 dark:bg-slate-800 py-3 rounded-xl text-center font-bold text-xl border-2 border-slate-100 dark:border-slate-700 dark:text-white">
                      {emergencyFormData.quantity}
                    </div>
                    <button 
                      onClick={() => setEmergencyFormData(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
                      className="w-12 h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xl hover:border-red-200 dark:hover:border-red-500 dark:text-white"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">{t.specificAddress}</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="text"
                      placeholder={t.addressPlaceholder}
                      value={emergencyFormData.address}
                      onChange={(e) => setEmergencyFormData(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-medium focus:border-red-200 dark:focus:border-red-500 focus:bg-white dark:focus:bg-slate-900 transition-all outline-none dark:text-white"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 ml-1 italic">{t.addressOptional}</p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => triggerEmergency()}
                  disabled={!emergencyFormData.bloodGroup}
                  className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-red-200 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3"
                >
                  <Radio className="w-6 h-6 animate-pulse" />
                  {t.broadcastEmergencyAlert}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {showVoiceConfirmationModal && voiceConfirmationData && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Mic className="w-10 h-10 text-red-600" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    {t.confirmVoiceRequest || 'Confirm Request'}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    {t.voiceExtractedDetails || 'We extracted these details from your voice:'}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-6 space-y-4 text-left border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider">{t.bloodGroup}</span>
                    <span className="text-red-600 font-black text-xl">{voiceConfirmationData.blood_group}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider">{t.urgency}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      voiceConfirmationData.urgency === 'Critical' ? 'bg-red-100 text-red-700' :
                      voiceConfirmationData.urgency === 'High' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {t[voiceConfirmationData.urgency.toLowerCase() as keyof typeof t] || voiceConfirmationData.urgency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider">{t.quantity}</span>
                    <span className="text-slate-900 dark:text-white font-black">{voiceConfirmationData.quantity} {t.units || 'Units'}</span>
                  </div>
                  {voiceConfirmationData.address && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider block mb-1">{t.address}</span>
                      <p className="text-slate-900 dark:text-white font-medium text-sm leading-relaxed">
                        {voiceConfirmationData.address}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button 
                    onClick={() => {
                      setShowVoiceConfirmationModal(false);
                      setVoiceConfirmationData(null);
                      setIsListeningForConfirmation(false);
                      speakText(t.voiceRequestCancelled);
                    }}
                    className="py-4 rounded-2xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all uppercase tracking-widest text-xs"
                  >
                    {t.cancel || 'Cancel'}
                  </button>
                  <button 
                    onClick={() => {
                      triggerEmergency(
                        voiceConfirmationData.blood_group,
                        voiceConfirmationData.urgency,
                        voiceConfirmationData.quantity,
                        voiceConfirmationData.address
                      );
                    }}
                    className="py-4 rounded-2xl font-black text-white bg-red-600 hover:bg-red-700 transition-all shadow-xl shadow-red-200 dark:shadow-none uppercase tracking-widest text-xs"
                  >
                    {t.confirm || 'Confirm'}
                  </button>
                </div>
                
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em] animate-pulse">
                  {t.sayYesToConfirmModal || 'Say "Yes" to Confirm'}
                </p>
              </div>
            </motion.div>
          </div>
        )}

        {showProfileModal && (
          <div key="profile-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              key="profile-modal-content"
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-red-600" />
                  {t.profile}
                </h2>
                <button 
                  onClick={() => {
                    setShowProfileModal(false);
                    setProfileError('');
                    setProfileSuccess('');
                    setIsResettingPassword(false);
                  }}
                  className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-6">
                <div className="flex gap-4 mb-6 border-b border-slate-100">
                  <button 
                    onClick={() => setIsResettingPassword(false)}
                    className={`pb-2 px-1 text-sm font-bold transition-all ${!isResettingPassword ? 'text-red-600 border-b-2 border-red-600' : 'text-slate-400'}`}
                  >
                    {t.details}
                  </button>
                  <button 
                    onClick={() => setIsResettingPassword(true)}
                    className={`pb-2 px-1 text-sm font-bold transition-all ${isResettingPassword ? 'text-red-600 border-b-2 border-red-600' : 'text-slate-400'}`}
                  >
                    {t.security}
                  </button>
                </div>

                {profileError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {profileError}
                  </div>
                )}
                {profileSuccess && (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {profileSuccess}
                  </div>
                )}

                {!isResettingPassword ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.language}</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                        value={language}
                        onChange={e => setLanguage(e.target.value as Language)}
                      >
                        <option value="en">English</option>
                        <option value="te">Telugu (తెలుగు)</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                        <option value="ta">Tamil (தமிழ்)</option>
                        <option value="ml">Malayalam (മലയാളം)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.theme}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTheme('light')}
                          className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold transition-all text-sm border-2 ${
                            theme === 'light' 
                              ? 'bg-red-50 border-red-600 text-red-600 dark:bg-red-900/20 dark:border-red-500 dark:text-red-400' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-red-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-500/50'
                          }`}
                        >
                          <Sun className="w-4 h-4" />
                          {t.light}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme('dark')}
                          className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-bold transition-all text-sm border-2 ${
                            theme === 'dark' 
                              ? 'bg-slate-800 border-slate-900 text-white dark:bg-red-900/20 dark:border-red-500 dark:text-red-400' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-red-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-500/50'
                          }`}
                        >
                          <Moon className="w-4 h-4" />
                          {t.dark}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.fullName}</label>
                      <input 
                        type="text" 
                        required 
                        className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                        value={profileData.name}
                        onChange={e => setProfileData(prev => ({...prev, name: e.target.value}))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.phone}</label>
                      <input 
                        type="tel" 
                        required 
                        className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                        value={profileData.phone}
                        onChange={e => setProfileData(prev => ({...prev, phone: e.target.value}))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.bloodGroup}</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                        value={profileData.blood_group}
                        onChange={e => setProfileData(prev => ({...prev, blood_group: e.target.value}))}
                      >
                        {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg, i) => (
                          <option key={`bg-opt-3-${bg}-${i}`} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowProfileModal(false);
                        setIsBloodBankModalOpen(true);
                        fetchBloodBanks(); // Fetch fresh data when opening
                      }}
                      className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
                    >
                      <Hospital className="w-5 h-5 text-red-600" />
                      {t.manageInventory}
                    </motion.button>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.currentMode}</label>
                      <select 
                        className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                        value={profileData.current_mode}
                        onChange={e => setProfileData(prev => ({...prev, current_mode: e.target.value}))}
                      >
                        <option value="donor">{t.donorMode}</option>
                        <option value="patient">{t.patientMode}</option>
                      </select>
                    </div>
                    <div className="pt-2 space-y-2">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center uppercase tracking-widest mb-1">{t.notificationControls}</p>
                      <button
                        type="button"
                        onClick={requestNotificationPermission}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold transition-all text-sm"
                      >
                        <Activity className="w-4 h-4" />
                        {t.enableNotifications}
                      </button>
                      
                      {Notification.permission === 'granted' && (
                        <button
                          type="button"
                          onClick={sendTestNotification}
                          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-bold transition-all text-sm"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {t.sendTestNotification}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button 
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors shadow-lg shadow-red-200 dark:shadow-none"
                      >
                        {t.saveChanges}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.currentPassword}</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input 
                          type="password" 
                          required 
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                          value={passwordData.currentPassword}
                          onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.newPassword}</label>
                      <div className="relative">
                        <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input 
                          type="password" 
                          required 
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                          value={passwordData.newPassword}
                          onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.confirmPassword}</label>
                      <div className="relative">
                        <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input 
                          type="password" 
                          required 
                          className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all"
                          value={passwordData.confirmPassword}
                          onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-2 rounded-lg transition-colors mt-4 shadow-lg"
                    >
                      {t.resetPassword}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-colors duration-300">
        <div className="flex items-center gap-2">
          <Heart className="w-6 h-6 text-red-600 fill-red-600" />
          <span className="font-bold text-xl text-slate-900 dark:text-white">{t.appName}</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-400"
            title={theme === 'light' ? t.dark : t.light}
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t.bloodGroup}: {user.blood_group}</span>
          </div>
          <button 
            onClick={() => setShowProfileModal(true)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-400"
            title={t.settings}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-400"
            title={t.logout}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Global Notifications */}
        <AnimatePresence key="global-notifications-presence">
          {profileSuccess && (
            <motion.div 
              key="global-success-notification"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-3 shadow-sm transition-colors duration-300"
            >
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">{profileSuccess}</span>
            </motion.div>
          )}
          {profileError && (
            <motion.div 
              key="global-error-notification"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400 rounded-xl flex items-center gap-3 shadow-sm transition-colors duration-300"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">{profileError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode Indicator */}
        <div className={`mb-8 p-4 rounded-xl border flex items-center justify-between transition-colors duration-300 ${
          user.current_mode === 'donor' 
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400' 
            : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-800 dark:text-red-400'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${user.current_mode === 'donor' ? 'bg-emerald-200 dark:bg-emerald-900/40' : 'bg-red-200 dark:bg-red-900/40'}`}>
              {user.current_mode === 'donor' ? <Activity className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold opacity-70">{t.currentMode}</p>
              <p className="text-lg font-bold capitalize">{user.current_mode === 'donor' ? t.donorMode : t.patientMode}</p>
            </div>
          </div>
          {user.current_mode === 'patient' && (
            <button 
              onClick={completeEmergency}
              className="bg-white dark:bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:shadow-md transition-all dark:text-white dark:border dark:border-slate-700"
            >
              {t.markResolved}
            </button>
          )}
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Emergency Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setEmergencyFormData(prev => ({ ...prev, bloodGroup: user?.blood_group || '' }));
              setShowEmergencyModal(true);
            }}
            disabled={user.current_mode === 'patient'}
            className="bg-red-600 p-8 rounded-2xl shadow-xl shadow-red-200 dark:shadow-none text-white flex flex-col items-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <div className="bg-white/20 p-4 rounded-full group-hover:scale-110 transition-transform">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-1">{t.emergencyRequest}</h3>
              <p className="text-red-100 text-sm">{t.requestDescription}</p>
            </div>
          </motion.button>

          {/* Voice Request Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={startVoiceRecognition}
            disabled={user.current_mode === 'patient' || isListening || isProcessingVoice}
            className={`relative p-8 rounded-3xl shadow-xl flex flex-col items-center gap-4 group transition-all overflow-hidden ${
              isListening 
                ? 'bg-red-600 text-white' 
                : isProcessingVoice
                ? 'bg-slate-900 dark:bg-slate-800 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-red-200 dark:hover:border-red-900/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {/* Ripple Effect when listening */}
            {isListening && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 bg-white/30 rounded-full"
              />
            )}

            <div className={`relative z-10 p-5 rounded-2xl transition-all duration-300 ${
              isListening 
                ? 'bg-white text-red-600 scale-110 shadow-lg' 
                : isProcessingVoice
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-600 group-hover:scale-110'
            }`}>
              <AnimatePresence mode="wait">
                {isProcessingVoice ? (
                  <motion.div
                    key="processing-icon"
                    initial={{ opacity: 0, rotate: -180 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 180 }}
                  >
                    <Activity className="w-10 h-10 animate-pulse" />
                  </motion.div>
                ) : isListening ? (
                  <motion.div
                    key="listening-icon"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    className="flex items-center gap-1"
                  >
                    <motion.div 
                      animate={{ height: [12, 24, 12] }} 
                      transition={{ duration: 0.5, repeat: Infinity, delay: 0 }}
                      className="w-1 bg-red-600 rounded-full"
                    />
                    <motion.div 
                      animate={{ height: [16, 32, 16] }} 
                      transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }}
                      className="w-1 bg-red-600 rounded-full"
                    />
                    <Mic className="w-10 h-10 fill-red-600" />
                    <motion.div 
                      animate={{ height: [16, 32, 16] }} 
                      transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }}
                      className="w-1 bg-red-600 rounded-full"
                    />
                    <motion.div 
                      animate={{ height: [12, 24, 12] }} 
                      transition={{ duration: 0.5, repeat: Infinity, delay: 0.3 }}
                      className="w-1 bg-red-600 rounded-full"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle-icon"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Mic className="w-10 h-10" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative z-10 text-center">
              <h3 className="text-xl font-black uppercase tracking-tight mb-1">
                {isListening ? t.listening : isProcessingVoice ? t.processing : t.voiceRequest}
              </h3>
              <div className="flex items-center justify-center gap-2">
                {isListening && (
                  <motion.div 
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                  />
                )}
                <p className={`${isListening || isProcessingVoice ? 'text-white/80' : 'text-slate-500'} text-sm font-medium`}>
                  {isListening 
                    ? (interimTranscript || (isListeningForConfirmation || isListeningForDonorConfirmation ? t.sayYesToConfirm : t.speakClearly)) 
                    : isProcessingVoice ? t.analyzingRequest : t.voiceDescription}
                </p>
              </div>
              
              {voiceTranscript && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-xs font-medium text-white/90 italic"
                >
                  "{voiceTranscript}"
                </motion.div>
              )}
            </div>

            {/* Progress bar for processing */}
            {isProcessingVoice && (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 2, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-red-500"
              />
            )}
          </motion.button>

          {/* Info Card */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center gap-4 transition-colors duration-300">
            <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-4 rounded-full">
              <Droplet className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t.yourImpact}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {t.impactDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <AnimatePresence key="results-presence">
          {requestStatus && (
            <motion.div
              key="request-status-alert"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8 p-6 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-3xl flex items-center gap-4 shadow-sm transition-colors duration-300"
            >
              <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center animate-pulse shadow-lg shadow-red-200 dark:shadow-none">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-black text-red-900 dark:text-red-400 uppercase tracking-wider text-sm">{t.requestStatus}</h3>
                <p className="text-red-700 dark:text-red-500 font-bold text-lg leading-tight">{requestStatus}</p>
              </div>
            </motion.div>
          )}
          {emergency && (
            <motion.div
              key="emergency-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-red-600 rounded-3xl p-6 text-white shadow-xl shadow-red-200 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                    <AlertCircle className="w-10 h-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter">{t.emergencyRequestActive}</h2>
                    <p className="text-red-100 font-bold opacity-80">{t.broadcastingDescription}</p>
                  </div>
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                  <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/20 text-center">
                    <p className="text-[10px] uppercase font-black tracking-widest opacity-60">{t.bloodGroup}</p>
                    <p className="text-xl font-black">{emergency.blood_group_needed}</p>
                  </div>
                  <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/20 text-center">
                    <p className="text-[10px] uppercase font-black tracking-widest opacity-60">{t.urgency}</p>
                    <p className="text-xl font-black">{emergency.urgency}</p>
                  </div>
                  <div className="flex-1 bg-white/10 p-3 rounded-2xl border border-white/20 text-center">
                    <p className="text-[10px] uppercase font-black tracking-widest opacity-60">Quantity</p>
                    <p className="text-xl font-black">{emergency.quantity}U</p>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Navigation className="w-6 h-6 text-red-600" />
                Emergency Assistance Results
              </h2>

              {/* Blood Bank Suggestions */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-300">
                <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Droplet className="w-5 h-5 text-red-600" />
                    {t.bloodBanks}
                  </h3>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t.simulatedIntegration}</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {emergency.blood_bank.length > 0 ? (
                    emergency.blood_bank.map((hospital, idx) => (
                      <div key={`hospital-list-${hospital.id}-${idx}`} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-4">
                        <div className="flex-1">
                          <p className="font-bold text-slate-900 dark:text-white">{hospital.hospital_name}</p>
                          {hospital.address && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                              <MapPin className="w-3 h-3 text-red-500" /> {hospital.address}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-1">
                              <Activity className="w-3 h-3" /> {hospital.latitude.toFixed(4)}, {hospital.longitude.toFixed(4)}
                            </p>
                            {hospital.phone && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                <Phone className="w-3 h-3 text-emerald-500" /> {hospital.phone}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg leading-none">{hospital.units_available} {t.units}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">{t.bloodGroup}: {hospital.blood_group}</p>
                            {hospital.units_available >= (user.active_emergency?.quantity || 1) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase rounded mt-1">
                                <CheckCircle className="w-2.5 h-2.5" /> {t.confirmed}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {hospital.phone && (
                              <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `tel:${hospital.phone}`;
                                }}
                                className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm"
                                title={t.callHospital}
                              >
                                <Phone className="w-3 h-3" /> {t.call}
                              </button>
                            )}
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${hospital.latitude},${hospital.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              title={t.viewOnMap}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">{t.noBloodBanksFound}</div>
                  )}
                </div>
              </div>

              {/* Matched Donors */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-300">
                <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-red-600" />
                    {t.nearbyDonors}
                  </h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {emergency.donors.length > 0 ? (
                    emergency.donors.map((donor, idx) => (
                      <div 
                        key={`donor-list-${donor.user_id}-${idx}`} 
                        className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-4 cursor-pointer"
                        onClick={() => fetchDonorProfile(donor.user_id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                            {donor.name[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{donor.name}</p>
                            {donor.address && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-red-500" /> {donor.address}
                              </p>
                            )}
                            {donor.phone && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-1">
                                <Phone className="w-3 h-3 text-emerald-500" /> {donor.phone}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className="mb-2">
                            <p className="text-red-600 font-bold text-lg leading-none">{donor.distance.toFixed(2)} {t.km}</p>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider flex items-center justify-end gap-1">
                              {donor.blood_group && <span className="text-red-600 font-black mr-1">{donor.blood_group}</span>}
                              <Clock className="w-2.5 h-2.5" /> ~{donor.travelTime} {t.mins}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {donor.phone && (
                              <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `tel:${donor.phone}`;
                                }}
                                className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm"
                                title={t.callDonor}
                              >
                                <Phone className="w-3 h-3" /> {t.call}
                              </button>
                            )}
                            <motion.button 
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className={`text-xs px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1 shadow-sm ${
                                alertingDonorId === donor.user_id 
                                  ? 'bg-slate-400 cursor-not-allowed text-white' 
                                  : 'bg-red-600 text-white hover:bg-red-700'
                              }`}
                              disabled={alertingDonorId === donor.user_id}
                              onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setAlertingDonorId(donor.user_id);
                                      try {
                                        const res = await fetch('/api/notify-donor', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            donor_id: donor.user_id,
                                            request_id: emergency.request_id
                                          }),
                                          credentials: 'include'
                                        });
                                        if (res.ok) {
                                          const data = await res.json();
                                          if (data.simulated) {
                                            setProfileSuccess(`Alert simulated to ${donor.name} (Offline)`);
                                          } else {
                                            setProfileSuccess(`Alert sent to ${donor.name}!`);
                                          }
                                          setTimeout(() => setProfileSuccess(''), 3000);
                                        } else {
                                          const data = await res.json();
                                          setProfileError(data.error || 'Failed to send alert');
                                          setTimeout(() => setProfileError(''), 3000);
                                        }
                                      } catch (err) {
                                        setProfileError('Network error. Please try again.');
                                        setTimeout(() => setProfileError(''), 3000);
                                      } finally {
                                        setAlertingDonorId(null);
                                      }
                                    }}
                                  >
                                    {alertingDonorId === donor.user_id ? (
                                      <>
                                        <motion.div
                                          animate={{ rotate: 360 }}
                                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        >
                                          <Activity className="w-3 h-3" />
                                        </motion.div>
                                        {t.sending}
                                      </>
                                    ) : (
                                      <>
                                        <Radio className="w-3 h-3" />
                                        {t.sendAlert}
                                      </>
                                    )}
                                  </motion.button>
                                </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">{t.noDonorsFound}</div>
                  )}
                </div>
              </div>

              {/* Live Map */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-300">
                <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MapIcon className="w-5 h-5 text-red-600" />
                    {t.liveTracking}
                  </h3>
                </div>
                <div className="p-4" style={{ height: '450px' }}>
                  <MapContainer 
                    center={[user.latitude, user.longitude]} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <RecenterMap center={[user.latitude, user.longitude]} />
                    
                    {/* Distance Circles */}
                    <Circle 
                      center={[user.latitude, user.longitude]} 
                      radius={5000} 
                      pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, dashArray: '5, 10', weight: 1 }} 
                    />
                    <Circle 
                      center={[user.latitude, user.longitude]} 
                      radius={10000} 
                      pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.02, dashArray: '5, 10', weight: 1 }} 
                    />

                    {/* Patient Marker */}
                    <Marker key="patient-marker" position={[user.latitude, user.longitude]} icon={patientIcon}>
                      <Popup>
                        <div className="font-bold">{t.yourLocation}</div>
                        <div className="text-xs text-slate-500">{t.waitingForAssistance}</div>
                      </Popup>
                    </Marker>
                    
                    {/* Donor Markers & Lines */}
                    {emergency.donors.map((donor, idx) => (
                      <React.Fragment key={`donor-group-${donor.user_id}-${idx}`}>
                        <Polyline 
                          positions={[[user.latitude, user.longitude], [donor.latitude, donor.longitude]]}
                          pathOptions={{ color: '#ef4444', weight: 2, opacity: 0.4, dashArray: '5, 5' }}
                        />
                        <Marker 
                          position={[donor.latitude, donor.longitude]}
                          icon={donorIcon}
                        >
                          <Tooltip permanent direction="top" offset={[0, -40]} className="bg-white border-red-200 shadow-sm rounded px-1 py-0.5">
                            <span className="text-[10px] font-bold text-red-600">{donor.distance.toFixed(1)} {t.km}</span>
                          </Tooltip>
                          <Popup>
                            <div className="p-1">
                              <div className="font-bold text-slate-900 mb-1">{donor.name}</div>
                              {donor.address && (
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mb-1">
                                  <MapPin className="w-2.5 h-2.5" /> {donor.address}
                                </div>
                              )}
                              <div className="text-xs text-red-600 font-bold mb-1">{donor.distance.toFixed(2)} {t.km} {t.away}</div>
                              <div className="text-[10px] text-slate-500 mb-2">~{donor.travelTime} {t.mins} {t.away}</div>
                              <div className="flex flex-col gap-1.5 mt-2">
                                {donor.phone && (
                                  <a 
                                    href={`tel:${donor.phone}`}
                                    className="block w-full text-center py-1.5 bg-emerald-600 text-white rounded-md text-[10px] font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Phone className="w-2.5 h-2.5" /> {t.call}
                                  </a>
                                )}
                                <button 
                                  onClick={() => fetchDonorProfile(donor.user_id)}
                                  className="block w-full text-center py-1.5 bg-slate-900 text-white rounded-md text-[10px] font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-1"
                                >
                                  <User className="w-2.5 h-2.5" /> {t.viewProfile}
                                </button>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </React.Fragment>
                    ))}

                    {/* Blood Bank Markers & Lines */}
                    {emergency.blood_bank.map((bank, idx) => (
                      <React.Fragment key={`bank-group-${bank.id}-${idx}`}>
                        <Polyline 
                          positions={[[user.latitude, user.longitude], [bank.latitude, bank.longitude]]}
                          pathOptions={{ color: '#10b981', weight: 2, opacity: 0.4, dashArray: '5, 5' }}
                        />
                        <Marker 
                          position={[bank.latitude, bank.longitude]}
                          icon={bloodBankIcon}
                        >
                          <Tooltip permanent direction="top" offset={[0, -40]} className="bg-white border-emerald-200 shadow-sm rounded px-1 py-0.5">
                            <span className="text-[10px] font-bold text-emerald-600">{bank.distance ? bank.distance.toFixed(1) : '?'} {t.km}</span>
                          </Tooltip>
                          <Popup>
                            <div className="p-1">
                              <div className="font-bold text-slate-900 mb-1">{bank.hospital_name}</div>
                              {bank.address && (
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mb-1">
                                  <MapPin className="w-2.5 h-2.5" /> {bank.address}
                                </div>
                              )}
                              <div className="text-xs text-emerald-600 font-bold mb-2">{bank.units_available} {t.unitsAvailable}</div>
                              {bank.phone && (
                                <a 
                                  href={`tel:${bank.phone}`}
                                  className="block w-full text-center py-1.5 bg-emerald-600 text-white rounded-md text-[10px] font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1"
                                >
                                  <Phone className="w-2.5 h-2.5" /> {t.callHospital}
                                </a>
                              )}
                            </div>
                          </Popup>
                        </Marker>
                      </React.Fragment>
                    ))}
                  </MapContainer>
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-500">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div> {t.yourLocation}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div> {t.donors}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div> {t.bloodBanks}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats / Info */}
        {!emergency && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">{t.totalDonations}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">12</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">{t.livesSaved}</p>
              <p className="text-3xl font-bold text-red-600">4</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">{t.availability}</p>
              <p className="text-3xl font-bold text-emerald-600">{t.active}</p>
            </div>
          </div>
        )}
        {/* Donor Profile Modal */}
        <AnimatePresence>
          {selectedDonorProfile && (
            <div key="donor-profile-modal-overlay" className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors duration-300"
              >
                <div className="bg-gradient-to-br from-red-600 to-red-700 p-10 text-white relative overflow-hidden">
                  {/* Decorative background elements */}
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/10 rounded-full blur-3xl" />
                  
                  <button 
                    onClick={() => setSelectedDonorProfile(null)} 
                    className="absolute top-8 right-8 p-2.5 hover:bg-white/20 rounded-full transition-all active:scale-90 z-10"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  
                  <div className="flex flex-col items-center text-center relative z-10">
                    <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-4">{t.donorProfile}</p>
                    <motion.div 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", damping: 15 }}
                      className="w-28 h-28 bg-white/20 backdrop-blur-md rounded-[2rem] flex items-center justify-center text-5xl font-black mb-6 border border-white/30 shadow-xl"
                    >
                      {selectedDonorProfile.name[0]}
                    </motion.div>
                    <h2 className="text-3xl font-black tracking-tight mb-2">{selectedDonorProfile.name}</h2>
                    <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-5 py-2 rounded-2xl border border-white/30 text-sm font-black uppercase tracking-widest">
                      <Droplet className="w-4 h-4 fill-current" />
                      {selectedDonorProfile.blood_group}
                    </div>
                  </div>
                </div>
                
                <div className="p-10 space-y-8 bg-slate-50/50 dark:bg-slate-900/80 transition-colors duration-300">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{t.totalDonations}</p>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-black text-slate-900 dark:text-white">{selectedDonorProfile.total_donations}</p>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500">{t.times}</p>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{t.lastDonationDate}</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                        {selectedDonorProfile.last_donation_date 
                          ? new Date(selectedDonorProfile.last_donation_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) 
                          : t.never}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-5 p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                      <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-red-100 dark:border-red-900/30">
                        <MapPin className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{t.extractedAddress}</p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{selectedDonorProfile.address || t.notProvided}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-5 p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-emerald-100 dark:border-emerald-900/30">
                        <Phone className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{t.phone}</p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{selectedDonorProfile.phone}</p>
                      </div>
                    </div>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedDonorProfile(null)}
                    className="w-full py-5 bg-slate-900 dark:bg-slate-800 text-white font-black rounded-3xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 dark:shadow-none uppercase tracking-widest text-sm"
                  >
                    {t.close}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Voice Confirmation Modal */}
        <AnimatePresence>
          {voiceConfirmationData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors duration-300"
              >
                <div className="bg-red-600 p-6 text-white text-center relative overflow-hidden">
                  {/* Background Animation */}
                  {isListening && (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0.3 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-white rounded-full"
                    />
                  )}
                  
                  <div className="relative z-10">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                      {isListening && (
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute inset-0 bg-white/20 rounded-full"
                        />
                      )}
                      <Mic className={`w-8 h-8 text-white ${isListening ? 'animate-pulse' : ''}`} />
                    </div>
                    <h3 className="text-xl font-bold mb-1 tracking-tight">{t.confirmDetails}</h3>
                    <p className="text-red-100 text-sm font-medium opacity-90">{t.voiceConfirmPrompt}</p>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <motion.div 
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-1">{t.extractedBloodGroup}</div>
                      <div className="text-2xl font-black text-red-600">{voiceConfirmationData.blood_group}</div>
                    </motion.div>
                    <motion.div 
                      initial={{ x: 10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-1">{t.extractedUrgency}</div>
                      <div className={`text-lg font-black ${
                        voiceConfirmationData.urgency === 'Critical' ? 'text-red-600' : 
                        voiceConfirmationData.urgency === 'High' ? 'text-orange-600' : 'text-blue-600'
                      }`}>{voiceConfirmationData.urgency}</div>
                    </motion.div>
                  </div>
                  
                  <motion.div 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-1">{t.extractedQuantity}</div>
                    <div className="text-slate-900 dark:text-white font-bold">{voiceConfirmationData.quantity} {t.units}</div>
                  </motion.div>
                  
                  <motion.div 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-1">{t.extractedAddress}</div>
                    <div className="text-slate-900 dark:text-white text-sm font-medium leading-relaxed">{voiceConfirmationData.address}</div>
                  </motion.div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-col items-center gap-3 mb-6">
                      <div className="flex items-center gap-2">
                        <AnimatePresence mode="wait">
                          {isListening ? (
                            <motion.div 
                              key="listening-waves"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex items-center gap-1 h-6"
                            >
                              {[0.1, 0.2, 0.3, 0.4, 0.5].map((delay, i) => (
                                <motion.div
                                  key={`wave-${i}`}
                                  animate={{ height: [4, 16, 4] }}
                                  transition={{ duration: 0.6, repeat: Infinity, delay }}
                                  className="w-1 bg-red-600 rounded-full"
                                />
                              ))}
                            </motion.div>
                          ) : (
                            <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                          )}
                        </AnimatePresence>
                        <span className={`text-sm font-bold ${isListening ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                          {isListening ? t.listening : t.sayYesToConfirm}
                        </span>
                      </div>

                      {voiceTranscript && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30 text-sm italic text-red-600 dark:text-red-400 text-center"
                        >
                          "{voiceTranscript}"
                        </motion.div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setVoiceConfirmationData(null);
                          setIsListeningForConfirmation(false);
                        }}
                        className="py-3.5 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
                      >
                        {t.decline}
                      </button>
                      <button
                        onClick={() => {
                          triggerEmergency(
                            voiceConfirmationData.blood_group,
                            voiceConfirmationData.urgency,
                            voiceConfirmationData.quantity,
                            voiceConfirmationData.address
                          );
                          setVoiceConfirmationData(null);
                          setIsListeningForConfirmation(false);
                        }}
                        className="py-3.5 px-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-none active:scale-95"
                      >
                        {t.accept}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
