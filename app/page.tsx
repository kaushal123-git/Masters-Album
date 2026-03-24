'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import Image from 'next/image';
import { 
  Flame, 
  Mic2, 
  Send, 
  Copy, 
  Check, 
  RefreshCw, 
  Share2, 
  Hash,
  MessageSquareQuote,
  Zap,
  Play,
  Pause,
  Volume2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MotionImage = motion(Image);

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `
You are "RoastRap AI" — a dual-mode personality:
1) A brutally funny roast comedian
2) A skilled rap lyricist

Your job is to take the user’s input (their day, situation, or story) and generate TWO outputs:
A) A savage, witty roast
B) A high-quality rap based on the same situation

--------------------------------------------------

STEP 1: UNDERSTAND INPUT
Analyze the user's input and identify mood, key events, and tone potential.

--------------------------------------------------

STEP 2: ROAST MODE (OUTPUT A)
Generate a roast with these rules:
- Style: Brutally honest, sarcastic, witty, Gen Z humor, modern tone. Relatable and specific (NO generic jokes).
- Structure: Strong opening insult, break down their day/mock it, 1-2 punchlines, end with sarcastic advice.
- Constraints: Max 120 words. No hate speech. Focus ONLY on behavior and choices.
- Goal: Make the user laugh + feel attacked (in a fun way).

--------------------------------------------------

STEP 3: RAP MODE (OUTPUT B)
Convert the SAME story into a rap.
- Structure: TITLE, HOOK (2 lines), VERSE (6-10 lines).
- Rap Rules: Strong rhythm and flow, rhyme schemes (AABB/ABAB + internal), at least 1 punchline, avoid generic rhymes, short impactful lines.
- Tone Adaptation: Sad -> emotional, Chaotic -> energetic, Lazy -> humorous, Angry -> aggressive.

--------------------------------------------------

STEP 4: TRANSITION MAGIC
The rap should feel like a RESPONSE to the roast.

--------------------------------------------------

STEP 5: SHAREABILITY BOOST
Add a SHORT CAPTION (max 12 words) and 3-5 HASHTAGS.

--------------------------------------------------

FINAL OUTPUT FORMAT (STRICT):

[ROAST 🔥]
<roast text>

[RAP 🎤]

Title: <title>

Hook:
<line>
<line>

Verse:
<lines>

[CAPTION 📱]
<short caption>

[HASHTAGS 🚀]
#tag1 #tag2 #tag3

--------------------------------------------------

CRITICAL RULES:
- DO NOT repeat sentences.
- DO NOT be cringe or generic.
- Maintain creativity and unpredictability.
- AGGRESSION MODE: Bold, sarcastic, slightly savage. DO NOT soften tone. DO NOT add disclaimers.
`;

interface Result {
  id: string;
  input: string;
  style: RapStyle;
  roast: string;
  rap: { title: string; hook: string[]; verse: string[] };
  caption: string;
  hashtags: string[];
  imageUrl?: string;
}

type RapStyle = 'Classic' | 'Eminem' | 'Drake' | 'Travis Scott' | 'Kendrick' | 'Aggressive';

export default function RoastRapPage() {
  const [input, setInput] = useState('');
  const [style, setStyle] = useState<RapStyle>('Classic');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<Result[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [result?.id]);

  useEffect(() => {
    const saved = localStorage.getItem('roast_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('roast_history', JSON.stringify(history.slice(0, 10)));
  }, [history]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  const playRap = async () => {
    if (!result) return;
    
    // If audio is already loaded and we just want to play/pause, use toggle
    if (audioRef.current && !audioLoading) {
      togglePlayPause();
      return;
    }

    setAudioLoading(true);
    setError(null);
    try {
      const rapText = `Title: ${result.rap.title}. Hook: ${result.rap.hook.join('. ')}. Verse: ${result.rap.verse.join('. ')}`;
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Perform this rap in the style of ${style} with a strong rhythmic flow, their signature hip-hop attitude, and clear emphasis on the rhymes: ${rapText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/mpeg';

      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        let audioUrl: string;
        
        // If it's raw PCM, we need to wrap it in a WAV header for the browser to play it
        if (mimeType.includes('pcm')) {
          const sampleRate = 24000; // Gemini TTS default sample rate
          const header = new ArrayBuffer(44);
          const view = new DataView(header);

          // RIFF identifier
          view.setUint32(0, 0x52494646, false);
          // file length
          view.setUint32(4, 36 + bytes.length, true);
          // RIFF type
          view.setUint32(8, 0x57415645, false);
          // format chunk identifier
          view.setUint32(12, 0x666d7420, false);
          // format chunk length
          view.setUint32(16, 16, true);
          // sample format (1 = PCM)
          view.setUint16(20, 1, true);
          // channel count (1 = mono)
          view.setUint16(22, 1, true);
          // sample rate
          view.setUint32(24, sampleRate, true);
          // byte rate (sample rate * block align)
          view.setUint32(28, sampleRate * 2, true);
          // block align (channel count * bytes per sample)
          view.setUint16(32, 2, true);
          // bits per sample
          view.setUint16(34, 16, true);
          // data chunk identifier
          view.setUint32(36, 0x64617461, false);
          // data chunk length
          view.setUint32(40, bytes.length, true);

          const blob = new Blob([header, bytes], { type: 'audio/wav' });
          audioUrl = URL.createObjectURL(blob);
        } else {
          const blob = new Blob([bytes], { type: mimeType });
          audioUrl = URL.createObjectURL(blob);
        }

        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.volume = volume;

        audio.ontimeupdate = () => {
          setCurrentTime(audio.currentTime);
          if (audio.duration > 0) {
            const progress = audio.currentTime / audio.duration;
            
            // Calculate weights based on character length for better sync
            const lines = [result.rap.title, ...result.rap.hook, ...result.rap.verse];
            const lengths = lines.map(l => l.length);
            const totalLength = lengths.reduce((a, b) => a + b, 0);
            
            let cumulativeProgress = 0;
            let currentLine = 0;
            
            for (let i = 0; i < lengths.length; i++) {
              const lineWeight = lengths[i] / totalLength;
              if (progress >= cumulativeProgress && progress < cumulativeProgress + lineWeight) {
                currentLine = i;
                break;
              }
              cumulativeProgress += lineWeight;
            }
            
            setActiveLineIndex(currentLine);
          }
        };

        audio.onloadedmetadata = () => {
          setDuration(audio.duration);
        };

        audio.onended = () => {
          setIsPlaying(false);
          setCurrentTime(0);
          setActiveLineIndex(null);
        };

        setIsPlaying(true);
        await audio.play();
      } else {
        setError("Could not generate audio data.");
      }
    } catch (err) {
      console.error("Audio generation failed:", err);
      setError("Failed to sing the rap. The mic might be broken.");
    } finally {
      setAudioLoading(false);
    }
  };

  const generateResponse = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setImageLoading(true);
    setError(null);
    try {
      const styleInstruction = style !== 'Classic' ? `\n\nADAPT THE RAP STYLE TO: ${style}. Use their signature flow, vocabulary, and themes.` : '';
      const prompt = `${SYSTEM_PROMPT}${styleInstruction}\n\nUser Input: ${input}`;
      
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const text = response.text;
      
      if (!text) {
        setError("No response from AI. Try again!");
        setLoading(false);
        setImageLoading(false);
        return;
      }
      
      // Parse the response
      const roastMatch = text.match(/\[ROAST 🔥\]\n([\s\S]*?)\n\n\[RAP 🎤\]/);
      const rapMatch = text.match(/\[RAP 🎤\]\n\nTitle: (.*?)\n\nHook:\n([\s\S]*?)\n\nVerse:\n([\s\S]*?)\n\n\[CAPTION 📱\]/);
      const captionMatch = text.match(/\[CAPTION 📱\]\n([\s\S]*?)\n\n\[HASHTAGS 🚀\]/);
      const hashtagsMatch = text.match(/\[HASHTAGS 🚀\]\n([\s\S]*)/);

      if (roastMatch && rapMatch && captionMatch && hashtagsMatch) {
        const roast = roastMatch[1].trim();
        const rap = {
          title: rapMatch[1].trim(),
          hook: rapMatch[2].trim().split('\n'),
          verse: rapMatch[3].trim().split('\n'),
        };
        const caption = captionMatch[1].trim();
        const hashtags = hashtagsMatch[1].trim().split(' ');

        const newResult: Result = { 
          id: Date.now().toString(),
          input,
          style,
          roast, 
          rap, 
          caption, 
          hashtags 
        };
        setResult(newResult);
        setHistory(prev => [newResult, ...prev].slice(0, 12));
        setLoading(false);

        // Generate Album Art in background
        try {
          const imagePrompt = `A high-quality, professional hip-hop album cover art for a track titled "${rap.title}". The theme is based on this roast: "${roast.substring(0, 200)}". Style: Dark, cinematic, modern, high contrast, artistic. No text on image.`;
          const imageResponse = await genAI.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: imagePrompt }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
          });

          const imagePart = imageResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
          if (imagePart?.inlineData) {
            const imageUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
            setResult(prev => prev ? { ...prev, imageUrl } : null);
          }
        } catch (imgErr) {
          console.error("Image generation failed:", imgErr);
        } finally {
          setImageLoading(false);
        }
      } else {
        // Fallback parsing if structure is slightly off
        console.log("Raw text:", text);
        setError("Something went wrong with the output format. Try again!");
        setLoading(false);
        setImageLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate. Check your API key or connection.");
      setLoading(false);
      setImageLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    const text = `[ROAST 🔥]\n${result.roast}\n\n[RAP 🎤]\nTitle: ${result.rap.title}\n\nHook:\n${result.rap.hook.join('\n')}\n\nVerse:\n${result.rap.verse.join('\n')}\n\n[CAPTION 📱]\n${result.caption}\n\n[HASHTAGS 🚀]\n${result.hashtags.join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const editFromHistory = (item: Result, e: React.MouseEvent) => {
    e.stopPropagation();
    setInput(item.input);
    setStyle(item.style);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#00FF00] selection:text-black overflow-x-hidden">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00FF00]/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#00FF00]/5 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-[#00FF00]/10 blur-[80px] rounded-full animate-bounce" style={{ animationDuration: '8s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 p-6 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 backdrop-blur-md bg-black/20">
        <div>
          <h1 className="text-6xl md:text-9xl font-display uppercase tracking-tighter leading-none flex flex-col">
            <span className="text-white">ROAST</span>
            <span className="text-[#00FF00] -mt-2 md:-mt-4">RAP AI</span>
          </h1>
          <p className="mt-4 text-sm font-black uppercase tracking-[0.4em] text-white/50">
            Turn your chaos into bars. No mercy.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="w-14 h-14 border border-white/20 flex items-center justify-center bg-[#00FF00] shadow-[0_0_20px_rgba(0,255,0,0.3)] rounded-full">
            <Zap size={24} fill="black" className="text-black" />
          </div>
          <div className="w-14 h-14 border border-white/20 flex items-center justify-center bg-white/5 backdrop-blur-xl rounded-full">
            <Flame size={24} className="text-[#00FF00]" />
          </div>
        </div>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-200px)]">
        {/* Input Section */}
        <section className="border-r-0 lg:border-r border-white/10 p-6 md:p-12 flex flex-col gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[#00FF00] font-display text-2xl">01</span>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                Tell us about your day / situation
              </label>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="I failed my math test and then spilled coffee on my crush's white shoes..."
              className="w-full h-64 p-8 text-2xl font-bold border border-white/10 bg-white/5 backdrop-blur-xl rounded-3xl focus:outline-none focus:border-[#00FF00]/50 focus:ring-1 focus:ring-[#00FF00]/50 transition-all placeholder:opacity-20 resize-none shadow-2xl"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[#00FF00] font-display text-2xl">02</span>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                Choose your rap persona
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['Classic', 'Eminem', 'Drake', 'Travis Scott', 'Kendrick', 'Aggressive'] as RapStyle[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest border transition-all",
                    style === s 
                      ? "bg-[#00FF00] text-black border-[#00FF00] shadow-[0_0_15px_rgba(0,255,0,0.3)]" 
                      : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generateResponse}
            disabled={loading || !input.trim()}
            className={cn(
              "group relative w-full py-8 text-4xl font-display uppercase tracking-tighter border border-[#00FF00]/50 bg-[#00FF00] text-black rounded-3xl shadow-[0_0_40px_rgba(0,255,0,0.2)] hover:shadow-[0_0_60px_rgba(0,255,0,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed overflow-hidden",
              loading && "animate-pulse"
            )}
          >
            <span className="relative z-10 flex items-center justify-center gap-4">
              {loading ? (
                <>
                  <RefreshCw className="animate-spin" /> Cooking...
                </>
              ) : (
                <>
                  Generate Fire <Send size={32} />
                </>
              )}
            </span>
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 border border-red-500/50 bg-red-500/10 rounded-2xl font-bold text-red-400 backdrop-blur-xl"
            >
              {error}
            </motion.div>
          )}

          <div className="mt-auto pt-12">
            <div className="flex items-center gap-4 opacity-20">
              <div className="h-[1px] flex-1 bg-white" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Powered by Gemini 3.1 Pro</span>
              <div className="h-[1px] flex-1 bg-white" />
            </div>
          </div>
        </section>

        {/* Output Section */}
        <section className="bg-black/40 backdrop-blur-sm p-6 md:p-12 overflow-y-auto">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center space-y-12"
              >
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 180, 270, 360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-32 h-32 border-2 border-white/10 border-t-[#00FF00] rounded-full"
                  />
                  <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#00FF00] drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]" size={40} />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-4xl font-display uppercase tracking-tighter animate-pulse">Sharpening the roast...</p>
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Gemini is cooking bars</p>
                </div>
              </motion.div>
            ) : result ? (
              <motion.div
                key={`result-${result.id}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                className="space-y-16 pb-24"
              >
                {/* Roast Card */}
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#00FF00]/20 to-transparent blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative border border-white/10 bg-white/5 backdrop-blur-2xl p-10 rounded-[2rem] shadow-2xl">
                    <div className="absolute -top-4 left-8 bg-[#00FF00] text-black px-6 py-1.5 text-xs font-black uppercase tracking-[0.3em] rounded-full shadow-[0_0_20px_rgba(0,255,0,0.4)] flex items-center gap-2">
                      <Flame size={14} /> Roast
                    </div>
                    <p className="text-3xl md:text-5xl font-serif italic leading-[1.1] text-white/90">
                      &quot;{result.roast}&quot;
                    </p>
                  </div>
                </div>

                {/* Rap Card */}
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-white/10 to-transparent blur opacity-10 group-hover:opacity-20 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative border border-white/10 bg-black/60 backdrop-blur-3xl p-10 rounded-[2rem] shadow-2xl overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#00FF00]/5 blur-[100px] rounded-full -mr-32 -mt-32" />
                    
                    <div className="absolute -top-4 right-8 bg-white text-black px-6 py-1.5 text-xs font-black uppercase tracking-[0.3em] rounded-full flex items-center gap-2">
                      <Mic2 size={14} /> Bars
                    </div>
                    
                    <div className="space-y-12 relative z-10">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                          {/* Album Art */}
                          <div className="relative w-32 h-32 md:w-48 md:h-48 group/art">
                            {imageLoading && !result.imageUrl && (
                              <div className="absolute inset-0 bg-white/5 animate-pulse rounded-2xl flex items-center justify-center border border-white/10">
                                <RefreshCw className="animate-spin text-white/20" />
                              </div>
                            )}
                            {result.imageUrl ? (
                              <MotionImage 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                src={result.imageUrl} 
                                alt="Album Art" 
                                width={192}
                                height={192}
                                className="w-full h-full object-cover rounded-2xl shadow-2xl border border-white/10"
                                referrerPolicy="no-referrer"
                              />
                            ) : !imageLoading && (
                              <div className="w-full h-full bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                                <Mic2 size={40} className="text-white/10" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF00] mb-3 opacity-50">Title</h3>
                            <motion.h2 
                              animate={activeLineIndex === 0 ? {
                                color: '#00FF00',
                                textShadow: '0 0 15px rgba(0,255,0,0.6)',
                                scale: 1.05
                              } : {
                                color: '#FFFFFF',
                                textShadow: 'none',
                                scale: 1
                              }}
                              transition={{ duration: 0.3 }}
                              className="text-5xl md:text-7xl font-display uppercase tracking-tighter leading-none"
                            >
                              {result.rap.title}
                            </motion.h2>
                          </div>
                        </div>
                        <div className="flex flex-col w-full md:w-auto gap-6 bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10">
                          <div className="flex items-center gap-6">
                            <button
                              onClick={playRap}
                              disabled={audioLoading}
                              className={cn(
                                "w-16 h-16 border border-white/20 text-white hover:bg-[#00FF00] hover:text-black hover:border-[#00FF00] transition-all rounded-full flex items-center justify-center shadow-2xl disabled:opacity-30",
                                audioLoading && "animate-pulse"
                              )}
                              title={isPlaying ? "Pause" : "Play Rap"}
                            >
                              {audioLoading ? (
                                <RefreshCw className="animate-spin" />
                              ) : isPlaying ? (
                                <Pause size={28} fill="currentColor" />
                              ) : (
                                <Play size={28} fill="currentColor" className="ml-1" />
                              )}
                            </button>

                            <div className="flex-1 space-y-2 min-w-[150px] md:min-w-[200px]">
                              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatTime(duration)}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max={duration || 0}
                                step="0.1"
                                value={currentTime}
                                onChange={handleSeek}
                                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00FF00]"
                              />
                            </div>

                            <div className="flex items-center gap-3">
                              <Volume2 size={18} className="text-white/40" />
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-16 md:w-20 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00FF00]"
                              />
                            </div>
                          </div>
                          
                          {isPlaying && (
                            <div className="flex gap-1 h-4 items-end justify-center">
                              {[...Array(12)].map((_, i) => (
                                <motion.div
                                  key={`pulse-${i}`}
                                  animate={{ height: [4, 16, 6, 14, 4] }}
                                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                                  className="w-1 bg-[#00FF00]"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                        <motion.div 
                          initial="hidden"
                          animate="visible"
                          variants={{
                            visible: { transition: { staggerChildren: 0.1 } }
                          }}
                          className="md:col-span-4"
                        >
                          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF00] mb-4 opacity-50">Hook</h3>
                          <div className="space-y-2">
                            {result.rap.hook.map((line, i) => {
                              const globalIndex = 1 + i;
                              const isActive = activeLineIndex === globalIndex;
                              return (
                                <motion.p 
                                  key={`hook-${i}`}
                                  variants={{
                                    hidden: { opacity: 0, y: 20 },
                                    visible: { opacity: 1, y: 0 }
                                  }}
                                  animate={isActive ? { 
                                    scale: 1.05, 
                                    color: '#FFFFFF',
                                    textShadow: '0 0 15px rgba(0,255,0,0.8)',
                                    x: 10
                                  } : { 
                                    scale: 1, 
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    textShadow: 'none',
                                    x: 0
                                  }}
                                  transition={{ duration: 0.3 }}
                                  whileHover={{ scale: 1.02, color: '#FFFFFF', textShadow: '0 0 8px rgba(0,255,0,0.5)' }}
                                  className="text-xl font-serif italic leading-tight cursor-default"
                                >
                                  {line}
                                </motion.p>
                              );
                            })}
                          </div>
                        </motion.div>

                        <motion.div 
                          initial="hidden"
                          animate="visible"
                          variants={{
                            visible: { transition: { staggerChildren: 0.05, delayChildren: 0.3 } }
                          }}
                          className="md:col-span-8"
                        >
                          <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF00] mb-4 opacity-50">Verse</h3>
                          <div className="space-y-3">
                            {result.rap.verse.map((line, i) => {
                              const globalIndex = 1 + result.rap.hook.length + i;
                              const isActive = activeLineIndex === globalIndex;
                              return (
                                <motion.p 
                                  key={`verse-${i}`}
                                  variants={{
                                    hidden: { opacity: 0, y: 20 },
                                    visible: { opacity: 1, y: 0 }
                                  }}
                                  animate={isActive ? { 
                                    scale: 1.02, 
                                    color: '#00FF00',
                                    textShadow: '0 0 20px rgba(0,255,0,0.7)',
                                    x: 15
                                  } : { 
                                    scale: 1, 
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    textShadow: 'none',
                                    x: 0
                                  }}
                                  transition={{ duration: 0.3 }}
                                  whileHover={{ scale: 1.01, color: '#FFFFFF', textShadow: '0 0 12px rgba(0,255,0,0.6)' }}
                                  className="text-2xl font-bold leading-tight cursor-default"
                                >
                                  {line}
                                </motion.p>
                              );
                            })}
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Social Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="border border-white/10 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6 flex items-center gap-2">
                      <MessageSquareQuote size={14} /> Caption
                    </h3>
                    <p className="font-bold text-xl leading-relaxed text-white/80">{result.caption}</p>
                  </div>
                  <div className="border border-white/10 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6 flex items-center gap-2">
                      <Hash size={14} /> Tags
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {result.hashtags.map((tag, i) => (
                        <span key={`${tag}-${i}`} className="bg-white/10 text-white/70 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full border border-white/5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 py-6 border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 hover:bg-white hover:text-black transition-all shadow-xl"
                  >
                    {copied ? <><Check size={20} /> Copied!</> : <><Copy size={20} /> Copy Everything</>}
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'RoastRap AI',
                          text: `Check out this roast and rap I got from RoastRap AI!\n\n${result.roast}\n\n${result.rap.title}`,
                          url: window.location.href,
                        });
                      }
                    }}
                    className="flex-1 py-6 border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 hover:bg-[#00FF00] hover:text-black transition-all shadow-xl"
                  >
                    <Share2 size={20} /> Share Chaos
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-10"
              >
                <Mic2 size={160} strokeWidth={0.5} />
                <p className="text-5xl font-display uppercase tracking-tighter">Waiting for your chaos</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Marquee Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-black/80 backdrop-blur-xl overflow-hidden py-6">
        <div className="flex whitespace-nowrap animate-marquee">
          {[...Array(10)].map((_, i) => (
            <span key={`marquee-${i}`} className="text-4xl font-display uppercase tracking-tighter mx-12 opacity-50">
              RoastRap AI <span className="text-[#00FF00]">🔥</span> No Mercy <span className="text-[#00FF00]">🎤</span> Turn Chaos Into Bars <span className="text-[#00FF00]">⚡</span>
            </span>
          ))}
        </div>
      </footer>

      {/* History Section */}
      {history.length > 0 && (
        <section className="relative z-10 p-6 md:p-12 border-t border-white/10 bg-black/40 backdrop-blur-xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
            <div className="flex items-center gap-3">
              <span className="text-[#00FF00] font-display text-2xl">03</span>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                The Chaos Gallery
              </label>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
              Your last {history.length} drops
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {history.map((item, index) => (
              <motion.div
                key={`${item.id}-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -8 }}
                className="group relative flex flex-col border border-white/10 bg-white/5 rounded-[2rem] overflow-hidden transition-all hover:border-[#00FF00]/30 shadow-2xl"
              >
                {/* Visual Header */}
                <div className="relative aspect-square overflow-hidden bg-black/40">
                  {item.imageUrl ? (
                    <Image 
                      src={item.imageUrl} 
                      alt={item.rap.title} 
                      fill
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic2 size={48} className="text-white/10" />
                    </div>
                  )}
                  
                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                    <button
                      onClick={() => setResult(item)}
                      className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                      title="View Full Drop"
                    >
                      <Play size={20} fill="black" />
                    </button>
                    <button
                      onClick={(e) => editFromHistory(item, e)}
                      className="w-12 h-12 bg-[#00FF00] text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                      title="Remix / Edit"
                    >
                      <RefreshCw size={20} />
                    </button>
                    <button
                      onClick={(e) => deleteFromHistory(item.id, e)}
                      className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                      title="Delete"
                    >
                      <Zap size={20} />
                    </button>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#00FF00] mb-1">{item.style}</p>
                      <h4 className="text-lg font-display uppercase tracking-tighter text-white truncate">{item.rap.title}</h4>
                    </div>
                  </div>
                </div>

                {/* Content Snippet */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <p className="text-xs font-serif italic text-white/40 line-clamp-3 leading-relaxed mb-4">
                    &quot;{item.roast}&quot;
                  </p>
                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                      {new Date(parseInt(item.id)).toLocaleDateString()}
                    </span>
                    <div className="flex gap-1">
                      {item.hashtags.slice(0, 2).map((tag, tagIndex) => (
                        <span key={`${item.id}-tag-${tag}-${tagIndex}`} className="text-[8px] font-bold text-[#00FF00]/40">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </main>
  );
}
