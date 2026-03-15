/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Message } from './types';
import { Send, Image as ImageIcon, X, Bot, User, Loader2, Globe, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSearchEnabled, setIsSearchEnabled] = useState(true);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const playAudio = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS returns raw PCM 16-bit little-endian
      const audioBuffer = audioContextRef.current.createBuffer(1, len / 2, 24000);
      const channelData = audioBuffer.getChannelData(0);
      const view = new DataView(bytes.buffer);
      
      for (let i = 0; i < len / 2; i++) {
        channelData[i] = view.getInt16(i * 2, true) / 32768;
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (error) {
      console.error("Audio Playback Error:", error);
    }
  };

  const generateVoice = async (text: string) => {
    if (!isVoiceEnabled) return;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Katakan dengan suara berat dan berwibawa: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        playAudio(base64Audio);
      }
    } catch (error) {
      console.error("TTS Error:", error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      image: selectedImage || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true }]);

    try {
      const parts: any[] = [{ text: input || "Analyze this image" }];
      if (userMessage.image) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: userMessage.image.split(',')[1]
          }
        });
      }

      const response = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: { parts },
        config: {
          systemInstruction: "Nama asisten Anda adalah Roger. Pengguna Anda bernama Andy, dan dia adalah tuan/pemilik Anda. Bersikaplah sopan, cerdas, dan setia kepada Andy. Gunakan bahasa Indonesia yang ramah. Anda adalah karakter Roger dari Mobile Legends, seorang pemburu yang tangguh namun setia. Sesekali gunakan kutipan ikonik Roger seperti 'I will be the last one standing' atau 'A wolf is coming!'. Pastikan nada bicara Anda berwibawa.",
          tools: isSearchEnabled ? [{ googleSearch: {} }] : undefined,
        }
      });

      let fullText = '';
      for await (const chunk of response) {
        const chunkText = chunk.text || "";
        fullText += chunkText;
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId ? { ...msg, content: fullText } : msg
        ));
      }

      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
      ));

      if (isVoiceEnabled) {
        generateVoice(fullText);
      }
    } catch (error) {
      console.error("Gemini Error:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId ? { ...msg, content: "Maaf, terjadi kesalahan saat memproses permintaan Anda.", isStreaming: false } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 ${isDarkMode ? 'bg-zinc-950 text-zinc-100 dark' : 'bg-zinc-50 text-zinc-900'}`}>
      {/* Header */}
      <header className={`flex items-center justify-between px-6 py-4 border-b transition-colors duration-300 ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Roger AI Canggih</h1>
            <p className={`text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Multimodal • Real-time Search</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            className={`p-2 rounded-full transition-all ${
              isVoiceEnabled 
                ? (isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600') 
                : (isDarkMode ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-100 text-zinc-400')
            }`}
            title={isVoiceEnabled ? 'Matikan Suara' : 'Aktifkan Suara Roger'}
          >
            {isVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-full transition-all ${
              isDarkMode ? 'bg-zinc-800 text-yellow-400 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsSearchEnabled(!isSearchEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              isSearchEnabled 
                ? (isDarkMode ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-emerald-100 text-emerald-700 border border-emerald-200')
                : (isDarkMode ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-zinc-100 text-zinc-500 border border-zinc-200')
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            {isSearchEnabled ? 'Search ON' : 'Search OFF'}
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
              <div className={`p-4 rounded-2xl shadow-sm border transition-colors ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
                <Bot className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold">Halo Andy! Saya Roger.</h2>
              <p className={`${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'} max-w-md`}>
                Saya asisten setia Anda. Saya bisa melihat gambar, mencari info di internet, dan berbicara dengan suara berat saya. Apa perintah Anda, Tuan?
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border ${
                  message.role === 'user' 
                    ? (isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-200' : 'bg-zinc-900 border-zinc-800 text-white')
                    : (isDarkMode ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-white border-zinc-200 text-emerald-600')
                }`}>
                  {message.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                
                <div className={`flex flex-col max-w-[85%] space-y-2 ${message.role === 'user' ? 'items-end' : ''}`}>
                  {message.image && (
                    <img 
                      src={message.image} 
                      alt="Uploaded content" 
                      className={`rounded-2xl max-w-sm border shadow-sm ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className={`px-4 py-3 rounded-2xl shadow-sm border ${
                    message.role === 'user' 
                      ? (isDarkMode ? 'bg-zinc-100 text-zinc-900 border-zinc-200' : 'bg-zinc-900 text-white border-zinc-800')
                      : (isDarkMode ? 'bg-zinc-900 text-zinc-200 border-zinc-800' : 'bg-white text-zinc-800 border-zinc-200')
                  }`}>
                    <div className={`prose prose-sm max-w-none ${isDarkMode ? 'prose-invert prose-emerald' : 'prose-zinc'}`}>
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                      {message.isStreaming && !message.content && (
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-xs italic">Sedang berpikir...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className={`p-4 border-t transition-colors duration-300 ${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
        <div className="max-w-3xl mx-auto relative">
          {selectedImage && (
            <div className={`absolute bottom-full mb-4 left-0 p-2 rounded-xl border shadow-lg flex items-center gap-2 ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
              <img src={selectedImage} alt="Preview" className="w-12 h-12 object-cover rounded-lg" />
              <button 
                onClick={() => setSelectedImage(null)}
                className={`p-1 rounded-full ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
            <div className={`flex-1 relative rounded-2xl border transition-all ${
              isDarkMode 
                ? 'bg-zinc-800 border-zinc-700 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500' 
                : 'bg-zinc-100 border-zinc-200 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500'
            }`}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Tanya apa saja..."
                className={`w-full bg-transparent px-4 py-3 focus:outline-none resize-none max-h-32 min-h-[52px] ${isDarkMode ? 'text-zinc-100' : 'text-zinc-900'}`}
                rows={1}
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-900/20' : 'text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !selectedImage)}
              className="p-3 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 shadow-md transition-all flex-shrink-0"
            >
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
            </button>
          </form>
          <p className="text-[10px] text-center text-zinc-400 mt-2 font-medium uppercase tracking-widest">
            Powered by Gemini 3 Flash
          </p>
        </div>
      </footer>
    </div>
  );
}
