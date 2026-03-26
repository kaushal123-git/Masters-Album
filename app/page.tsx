'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, type User, OperationType, handleFirestoreError } from '@/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Mic2, Send, LogIn, LogOut, History, Share2, Copy, Check, Loader2, Sparkles, Trash2, User as UserIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

// --- Types ---
interface Rap {
  title: string;
  hook: string;
  verse: string;
}

interface RoastRapEntry {
  id?: string;
  userId: string;
  input: string;
  roast: string;
  rap: Rap;
  humanRoast?: string;
  humanRap?: string;
  caption: string;
  hashtags: string[];
  createdAt: any;
}

// --- Gemini Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

const SYSTEM_INSTRUCTION = `You are "RoastRap AI" — a dual-mode personality:
1) A brutally funny roast comedian
2) A skilled rap lyricist

Your job is to take the user’s input (their day, situation, or story) and generate TWO outputs:
A) A savage, witty roast
B) A high-quality rap based on the same situation

STEP 1: UNDERSTAND INPUT
Analyze the user's input and identify mood, key events, and tone potential.

STEP 2: ROAST MODE (OUTPUT A)
Generate a roast:
- Brutally honest, sarcastic, witty
- Gen Z humor, modern tone
- Relatable and specific (NO generic jokes)
- Max 120 words
- Focus ONLY on behavior and choices

STEP 3: RAP MODE (OUTPUT B)
Convert the SAME story into a rap:
- TITLE (short, catchy)
- HOOK (2 lines, repeatable)
- VERSE (6–10 lines)
- Strong rhythm and flow, rhyme schemes (AABB / ABAB)
- Include at least 1 punchline

STEP 4: TRANSITION MAGIC
The rap should feel like a RESPONSE to the roast.

STEP 5: SHAREABILITY BOOST
Add a SHORT CAPTION (max 12 words) and 3-5 HASHTAGS.

OUTPUT FORMAT:
You MUST return a JSON object with the following structure:
{
  "roast": "roast text",
  "rap": {
    "title": "title",
    "hook": "hook text",
    "verse": "verse text"
  },
  "caption": "caption text",
  "hashtags": ["tag1", "tag2", "tag3"]
}`;

// --- Components ---

const LoadingMessages = [
  "Sharpening the insults...",
  "Finding the perfect rhymes...",
  "Consulting the roast gods...",
  "Cooking up some heat...",
  "Analyzing your life choices...",
  "Preparing the burn unit...",
  "Writing bars that hit harder than reality...",
];

export default function RoastRapApp() {
  const [user, setUser] = useState<User | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LoadingMessages[0]);
  const [currentEntry, setCurrentEntry] = useState<RoastRapEntry | null>(null);
  const [history, setHistory] = useState<RoastRapEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [battleMode, setBattleMode] = useState(false);
  const [humanRoast, setHumanRoast] = useState('');
  const [humanRap, setHumanRap] = useState('');

  const historyEndRef = useRef<HTMLDivElement>(null);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentEntry(null);
      setHistory([]);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // --- History ---
  useEffect(() => {
    if (user && isAuthReady) {
      const q = query(
        collection(db, 'roasts'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const entries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as RoastRapEntry[];
        setHistory(entries);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'roasts');
      });

      return () => unsubscribe();
    }
  }, [user, isAuthReady]);

  // --- Generation ---
  const generateRoastRap = async () => {
    if (!input.trim() || !user) return;

    setLoading(true);
    setError(null);
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LoadingMessages.length;
      setLoadingMsg(LoadingMessages[msgIndex]);
    }, 2000);

    try {
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: input,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              roast: { type: Type.STRING },
              rap: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  hook: { type: Type.STRING },
                  verse: { type: Type.STRING }
                },
                required: ["title", "hook", "verse"]
              },
              caption: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["roast", "rap", "caption", "hashtags"]
          }
        }
      });

      const response = await model;
      const text = response.text;
      if (!text) throw new Error("No response from AI");
      const data = JSON.parse(text);

      const newEntry: RoastRapEntry = {
        userId: user.uid,
        input: input,
        roast: data.roast,
        rap: data.rap,
        humanRoast: battleMode ? humanRoast : undefined,
        humanRap: battleMode ? humanRap : undefined,
        caption: data.caption,
        hashtags: data.hashtags,
        createdAt: Timestamp.now()
      };

      // Save to Firestore
      const docRef = await addDoc(collection(db, 'roasts'), newEntry);
      setCurrentEntry({ ...newEntry, id: docRef.id });
      setInput('');
      setHumanRoast('');
      setHumanRap('');
    } catch (err) {
      console.error("Generation failed", err);
      setError("Failed to generate your roast. The AI might be too intimidated by your chaos.");
    } finally {
      clearInterval(msgInterval);
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!currentEntry) return;
    const text = `[ROAST 🔥]\n${currentEntry.roast}\n\n[RAP 🎤]\nTitle: ${currentEntry.rap.title}\n\nHook:\n${currentEntry.rap.hook}\n\nVerse:\n${currentEntry.rap.verse}\n\n[CAPTION 📱]\n${currentEntry.caption}\n\n[HASHTAGS 🚀]\n${currentEntry.hashtags.join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-600 rounded-xl shadow-lg shadow-orange-900/20">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tighter uppercase italic">
            RoastRap <span className="text-orange-500">AI</span>
          </h1>
        </div>
        {user ? (
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Logged In</span>
              <span className="text-sm font-medium">{user.displayName}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-400 hover:text-white"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button 
            onClick={handleLogin}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-all transform hover:scale-105"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        )}
      </header>

      <main className="space-y-12">
        {/* Hero / Input Section */}
        <section className="relative">
          {!user && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm rounded-3xl border border-zinc-800/50">
              <div className="text-center p-8">
                <h2 className="text-2xl font-display font-bold mb-4">Ready to be roasted?</h2>
                <p className="text-zinc-400 mb-6 max-w-xs mx-auto">Sign in to turn your daily struggles into savage bars.</p>
                <button 
                  onClick={handleLogin}
                  className="px-8 py-3 bg-orange-600 text-white font-bold rounded-full hover:bg-orange-500 transition-all shadow-xl shadow-orange-900/20"
                >
                  Get Started
                </button>
              </div>
            </div>
          )}

          <div className={cn(
            "p-6 md:p-8 bg-zinc-900/50 border border-zinc-800 rounded-3xl transition-all",
            !user && "opacity-50 blur-[2px]"
          )}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 text-zinc-400">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-mono uppercase tracking-widest">The Situation</span>
              </div>
              
              <button
                onClick={() => setBattleMode(!battleMode)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border",
                  battleMode 
                    ? "bg-orange-600/20 border-orange-600 text-orange-500" 
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                )}
              >
                <Mic2 className="w-3 h-3" />
                {battleMode ? "Battle Mode: ON" : "Enable Battle Mode"}
              </button>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me about your day, a fail, or a vibe... don't hold back."
              className="w-full bg-transparent border-none focus:ring-0 text-xl md:text-2xl font-medium placeholder:text-zinc-700 resize-none min-h-[100px]"
              disabled={!user || loading}
            />

            <AnimatePresence>
              {battleMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden space-y-4 mt-6 pt-6 border-t border-zinc-800"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Your Roast</label>
                      <textarea
                        value={humanRoast}
                        onChange={(e) => setHumanRoast(e.target.value)}
                        placeholder="Write your best insult..."
                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-sm focus:border-orange-600 transition-colors min-h-[80px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Your Rap</label>
                      <textarea
                        value={humanRap}
                        onChange={(e) => setHumanRap(e.target.value)}
                        placeholder="Drop some bars..."
                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-sm focus:border-orange-600 transition-colors min-h-[80px]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between items-center mt-6">
              <div className="text-xs font-mono text-zinc-600">
                {input.length} / 1000
              </div>
              <button
                onClick={generateRoastRap}
                disabled={!user || loading || !input.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-bold rounded-full hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600 transition-all shadow-lg shadow-orange-900/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cooking...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Roast Me
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Loading State */}
        <AnimatePresence>
          {loading && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-12"
            >
              <div className="inline-block p-4 bg-zinc-900 rounded-full mb-4 animate-pulse">
                <Flame className="w-8 h-8 text-orange-500" />
              </div>
              <p className="text-xl font-display italic text-zinc-300">{loadingMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-2xl text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Result Section */}
        <AnimatePresence>
          {currentEntry && !loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-12"
            >
              {/* Roast Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm font-display font-bold uppercase tracking-widest">The Roast Battle</h3>
                </div>
                
                <div className={cn(
                  "grid gap-4",
                  currentEntry.humanRoast ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                )}>
                  {currentEntry.humanRoast && (
                    <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-4">Human Roast 👤</span>
                      <p className="text-lg font-medium italic text-zinc-400 leading-relaxed">
                        &quot;{currentEntry.humanRoast}&quot;
                      </p>
                    </div>
                  )}
                  
                  <div className={cn(
                    "relative p-8 bg-zinc-900 border-l-4 border-orange-600 rounded-2xl overflow-hidden shadow-xl shadow-orange-900/5",
                    currentEntry.humanRoast && "md:scale-105 md:z-10 ring-1 ring-orange-600/20"
                  )}>
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Flame className="w-24 h-24" />
                    </div>
                    <span className="text-[10px] font-mono text-orange-500 uppercase tracking-widest font-bold block mb-4">
                      {currentEntry.humanRoast ? "AI Counter-Roast 🤖" : "AI Roast 🔥"}
                    </span>
                    <p className="text-xl md:text-2xl font-medium leading-relaxed italic text-zinc-200">
                      &quot;{currentEntry.roast}&quot;
                    </p>
                  </div>
                </div>
              </div>

              {/* Rap Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <Mic2 className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm font-display font-bold uppercase tracking-widest">The Rap Battle</h3>
                </div>

                <div className={cn(
                  "grid gap-6",
                  currentEntry.humanRap ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                )}>
                  {currentEntry.humanRap && (
                    <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-3xl">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Human Bars 👤</span>
                          <h4 className="text-xl font-display font-bold uppercase mt-1">Challenger</h4>
                        </div>
                      </div>
                      <div className="space-y-4 font-mono text-zinc-400">
                        <p className="text-sm whitespace-pre-wrap leading-tight">
                          {currentEntry.humanRap}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "p-8 bg-zinc-100 text-zinc-900 rounded-3xl shadow-2xl shadow-white/5",
                    currentEntry.humanRap && "md:scale-105 md:z-10"
                  )}>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">
                          {currentEntry.humanRap ? "AI Response 🤖" : "AI Track 🎤"}
                        </span>
                        <h2 className="text-3xl md:text-4xl font-display font-black uppercase tracking-tighter mt-2">
                          {currentEntry.rap.title}
                        </h2>
                      </div>
                      <button 
                        onClick={copyToClipboard}
                        className="p-3 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-all"
                        title="Copy to clipboard"
                      >
                        {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>

                    <div className="space-y-8 font-mono">
                      <div>
                        <span className="text-[10px] text-zinc-400 uppercase font-bold block mb-2">[HOOK]</span>
                        <p className="text-lg font-bold whitespace-pre-wrap leading-tight">
                          {currentEntry.rap.hook}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 uppercase font-bold block mb-2">[VERSE]</span>
                        <p className="text-lg whitespace-pre-wrap leading-tight">
                          {currentEntry.rap.verse}
                        </p>
                      </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-zinc-200">
                      <div className="flex flex-wrap gap-2 mb-4">
                        {currentEntry.hashtags.map((tag, i) => (
                          <span key={i} className="text-xs font-bold text-orange-600">#{tag.replace('#', '')}</span>
                        ))}
                      </div>
                      <p className="text-sm font-medium text-zinc-500 italic">
                        &quot;{currentEntry.caption}&quot;
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Section */}
        {user && history.length > 0 && (
          <section className="pt-12 border-t border-zinc-900">
            <div className="flex items-center gap-2 mb-8">
              <History className="w-5 h-5 text-zinc-500" />
              <h3 className="text-lg font-display font-bold uppercase tracking-widest text-zinc-500">Previous Burns</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setCurrentEntry(entry);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-left p-6 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl hover:bg-zinc-900/60 transition-all group"
                >
                  <p className="text-sm text-zinc-500 mb-2 font-mono">
                    {entry.createdAt instanceof Timestamp ? entry.createdAt.toDate().toLocaleDateString() : 'Recently'}
                  </p>
                  <h4 className="font-bold text-zinc-200 line-clamp-1 group-hover:text-orange-500 transition-colors">
                    {entry.rap.title}
                  </h4>
                  <p className="text-xs text-zinc-500 mt-2 line-clamp-2 italic">
                    {entry.roast}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-24 py-8 border-t border-zinc-900 text-center">
        <p className="text-xs font-mono text-zinc-600 uppercase tracking-[0.2em]">
          Powered by Gemini 3 & Your Bad Decisions
        </p>
      </footer>
    </div>
  );
}
