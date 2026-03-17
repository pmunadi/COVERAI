import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  Upload, 
  Download, 
  RefreshCw, 
  Type, 
  Image as ImageIcon, 
  Trash2, 
  GripHorizontal, 
  Bold, 
  Italic, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  AlignJustify,
  Minus,
  Plus,
  Eye,
  Monitor,
  Smartphone,
  Palette,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toJpeg } from 'html-to-image';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
type FontStyle = 'serif' | 'sans-serif';

interface TextItem {
  id: string;
  type: 'title' | 'subtitle';
  content: string;
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  scale: number;
}

interface BgTransform {
  scale: number;
  x: number;
  y: number;
}

// --- Constants ---
const V_WIDTH = 576;
const V_HEIGHT = 1024;
const H_WIDTH = 1024;
const H_HEIGHT = 576;

export default function App() {
  // --- State ---
  const [summary, setSummary] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgTransform, setBgTransform] = useState<BgTransform>({ scale: 100, x: 0, y: 0 });
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [fontStyle, setFontStyle] = useState<FontStyle>('sans-serif');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialState, setInitialState] = useState<any>(null);
  
  const [popupPos, setPopupPos] = useState({ x: 400, y: 100 });
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const [popupDragStart, setPopupDragStart] = useState({ x: 0, y: 0 });
  const [popupInitialPos, setPopupInitialPos] = useState({ x: 20, y: 20 });

  const canvasRef = useRef<HTMLDivElement>(null);

  const CANVAS_WIDTH = orientation === 'vertical' ? V_WIDTH : H_WIDTH;
  const CANVAS_HEIGHT = orientation === 'vertical' ? V_HEIGHT : H_HEIGHT;

  // --- AI Logic ---
  const generateCopywriting = async () => {
    if (!summary.trim()) return;
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Based on this summary: "${summary}", generate a short, powerful Title and a supporting Subtitle for a cover design. 
        The Title should be very short (max 5 words). 
        The Subtitle should be descriptive but concise.
        Return as JSON: { "title": "...", "subtitle": "..." }`,
        config: { responseMimeType: "application/json" }
      });
      
      const data = JSON.parse(response.text);
      setTitle(data.title);
      setSubtitle(data.subtitle);
    } catch (err) {
      console.error("AI Copywriting failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getBrightness = (imageSrc: string): Promise<'light' | 'dark'> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('light');
        
        canvas.width = 100;
        canvas.height = 100;
        ctx.drawImage(img, 0, 0, 100, 100);
        
        const imageData = ctx.getImageData(0, 0, 100, 100).data;
        let brightness = 0;
        for (let i = 0; i < imageData.length; i += 4) {
          brightness += (imageData[i] * 299 + imageData[i + 1] * 587 + imageData[i + 2] * 114) / 1000;
        }
        brightness = brightness / (imageData.length / 4);
        resolve(brightness > 128 ? 'light' : 'dark');
      };
      img.onerror = () => resolve('light');
    });
  };

  const generateLayout = async () => {
    if (!title || !subtitle) return;
    setIsLoading(true);
    
    let autoColor = 'black';
    if (bgImage) {
      const brightness = await getBrightness(bgImage);
      autoColor = brightness === 'dark' ? 'white' : 'black';
    }

    const newItems: TextItem[] = [
      {
        id: 'title',
        type: 'title',
        content: title,
        x: 50,
        y: 30,
        width: 80,
        fontSize: 48,
        color: autoColor,
        align: 'center',
        fontWeight: 'bold',
        fontStyle: 'normal',
        scale: 1
      },
      {
        id: 'subtitle',
        type: 'subtitle',
        content: subtitle,
        x: 50,
        y: 45,
        width: 70,
        fontSize: 18,
        color: autoColor,
        align: 'center',
        fontWeight: 'normal',
        fontStyle: 'normal',
        scale: 1
      }
    ];
    
    setTextItems(newItems);
    setIsLoading(false);
    setSelectedId('title');
  };

  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [calculatedScale, setCalculatedScale] = useState(0.5);
  const mainRef = useRef<HTMLDivElement>(null);

  // Calculate "Fit" scale
  const updateFitScale = useCallback(() => {
    if (zoom === 'fit' && mainRef.current) {
      const padding = 80;
      const availableWidth = mainRef.current.clientWidth - padding;
      const availableHeight = mainRef.current.clientHeight - padding;
      const scaleW = availableWidth / CANVAS_WIDTH;
      const scaleH = availableHeight / CANVAS_HEIGHT;
      setCalculatedScale(Math.min(scaleW, scaleH));
    } else if (typeof zoom === 'number') {
      setCalculatedScale(zoom);
    }
  }, [zoom, CANVAS_WIDTH, CANVAS_HEIGHT]);

  useEffect(() => {
    updateFitScale();
    window.addEventListener('resize', updateFitScale);
    return () => window.removeEventListener('resize', updateFitScale);
  }, [updateFitScale]);

  // --- Handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setBgImage(event.target?.result as string);
        setBgTransform({ scale: 100, x: 0, y: 0 });
        setSelectedId('background');
      };
      reader.readAsDataURL(file);
    }
  };

  const clearProject = () => {
    setSummary('');
    setTitle('');
    setSubtitle('');
    setBgImage(null);
    setBgTransform({ scale: 100, x: 0, y: 0 });
    setTextItems([]);
    setSelectedId(null);
  };

  const handleDownload = async () => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    const prevSelected = selectedId;
    setSelectedId(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      const dataUrl = await toJpeg(canvasRef.current, {
        quality: 1.0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        style: {
          transform: 'scale(1)',
          borderRadius: '0',
          margin: '0',
          padding: '0'
        }
      });
      const link = document.createElement('a');
      link.download = `cover-${Date.now()}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
      setSelectedId(prevSelected);
    }
  };

  // --- Interaction Logic ---
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    setIsDragging(true);
    setIsResizing(false);
    setDragStart({ x: e.clientX, y: e.clientY });
    
    if (id === 'background') {
      setInitialState({ ...bgTransform });
    } else {
      const item = textItems.find(i => i.id === id);
      setInitialState({ ...item });
    }
  };

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    setIsResizing(true);
    setIsDragging(false);
    setDragStart({ x: e.clientX, y: e.clientY });
    
    if (id === 'background') {
      setInitialState({ ...bgTransform });
    } else {
      const item = textItems.find(i => i.id === id);
      setInitialState({ ...item });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizing) return;
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const s_dx = e.clientX - dragStart.x;
      const s_dy = e.clientY - dragStart.y;

      if (selectedId === 'background') {
        if (isDragging) {
          setBgTransform({
            ...bgTransform,
            x: initialState.x + (s_dx / calculatedScale),
            y: initialState.y + (s_dy / calculatedScale)
          });
        } else if (isResizing) {
          const scaleDx = s_dx * 0.5;
          setBgTransform({
            ...bgTransform,
            scale: Math.max(10, initialState.scale + scaleDx)
          });
        }
      } else {
        const dx = (s_dx / rect.width) * 100;
        const dy = (s_dy / rect.height) * 100;
        setTextItems(prev => prev.map(item => {
          if (item.id === selectedId) {
            if (isDragging) {
              return { ...item, x: initialState.x + dx, y: initialState.y + dy };
            } else if (isResizing) {
              const scaleDx = s_dx * 0.01;
              return { ...item, scale: Math.max(0.1, initialState.scale + scaleDx) };
            }
          }
          return item;
        }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, selectedId, dragStart, initialState, bgTransform]);

  // Popup Drag Logic
  const handlePopupDragStart = (e: React.MouseEvent) => {
    setIsDraggingPopup(true);
    setPopupDragStart({ x: e.clientX, y: e.clientY });
    setPopupInitialPos({ ...popupPos });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingPopup) return;
      setPopupPos({
        x: popupInitialPos.x + (e.clientX - popupDragStart.x),
        y: popupInitialPos.y + (e.clientY - popupDragStart.y)
      });
    };
    const handleMouseUp = () => setIsDraggingPopup(false);
    if (isDraggingPopup) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPopup, popupDragStart, popupInitialPos]);

  // --- Render Helpers ---
  const updateItem = (id: string, updates: Partial<TextItem>) => {
    setTextItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  return (
    <div className="flex h-screen bg-zinc-100 overflow-hidden font-sans text-zinc-900">
      {/* Sidebar */}
      <aside className="w-96 bg-white border-r border-zinc-200 flex flex-col shadow-xl z-20">
        <div className="p-8 border-b border-zinc-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter uppercase">CoverAI</h1>
          </div>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.2em]">Visual Message Engine</p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {/* Step 1: Input Summary */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Type className="w-4 h-4" /> 1. Content Summary
              </label>
              <span className="text-[10px] font-mono text-zinc-300">{summary.length}/500</span>
            </div>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What is your content about?"
              className="w-full h-32 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            />
            <button
              onClick={generateCopywriting}
              disabled={!summary || isLoading}
              className="w-full py-3 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Copywriting
            </button>
          </section>

          {/* Step 2: Visual Assets */}
          <section className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> 2. Visual Assets
            </label>
            <div className="relative group">
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="p-8 border-2 border-dashed border-zinc-200 rounded-2xl group-hover:border-indigo-400 transition-colors flex flex-col items-center gap-3 bg-zinc-50">
                <Upload className="w-6 h-6 text-zinc-300" />
                <span className="text-xs font-bold text-zinc-500">{bgImage ? 'Change Background' : 'Upload Background'}</span>
              </div>
            </div>
          </section>

          {/* Step 3: Layout & Style */}
          <section className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <Palette className="w-4 h-4" /> 3. Style & Layout
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setOrientation('vertical')}
                className={`py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-2 ${orientation === 'vertical' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300'}`}
              >
                <Smartphone className="w-4 h-4" /> Vertical
              </button>
              <button
                onClick={() => setOrientation('horizontal')}
                className={`py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-2 ${orientation === 'horizontal' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300'}`}
              >
                <Monitor className="w-4 h-4" /> Horizontal
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFontStyle('serif')}
                className={`py-3 text-xs font-bold rounded-xl border transition-all ${fontStyle === 'serif' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300'}`}
              >
                Serif
              </button>
              <button
                onClick={() => setFontStyle('sans-serif')}
                className={`py-3 text-xs font-bold rounded-xl border transition-all ${fontStyle === 'sans-serif' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300'}`}
              >
                Sans Serif
              </button>
            </div>
            <button
              onClick={generateLayout}
              disabled={!title || isLoading}
              className="w-full py-4 bg-indigo-600 text-white text-sm font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              GENERATE LAYOUT
            </button>
          </section>
        </div>

        <div className="p-8 border-t border-zinc-100 bg-zinc-50 flex gap-3">
          <button
            onClick={clearProject}
            className="flex-1 py-3 bg-white border border-zinc-200 text-zinc-600 text-xs font-bold rounded-xl hover:bg-zinc-100 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
          <button
            onClick={handleDownload}
            disabled={isExporting || textItems.length === 0}
            className="flex-[2] py-3 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download JPEG
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main 
        ref={mainRef}
        className="flex-1 relative flex flex-col items-center justify-center p-12 overflow-hidden"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {/* Zoom Controls */}
        <div className="absolute top-8 right-8 flex bg-white border border-zinc-200 rounded-xl shadow-sm p-1 z-50">
          <button 
            onClick={() => setZoom(0.5)}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${zoom === 0.5 ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            50%
          </button>
          <button 
            onClick={() => setZoom('fit')}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${zoom === 'fit' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            FIT
          </button>
          <button 
            onClick={() => setZoom(1)}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${zoom === 1 ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            100%
          </button>
        </div>

        {/* Canvas Container */}
        <div 
          className="relative shadow-[0_40px_100px_-20px_rgba(0,0,0,0.2)] bg-white overflow-hidden"
          style={{ 
            width: CANVAS_WIDTH, 
            height: CANVAS_HEIGHT, 
            transform: `scale(${calculatedScale})`,
            transformOrigin: 'center center',
            flexShrink: 0
          }}
          ref={canvasRef}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {/* Background */}
          {bgImage && (
            <div 
              className={`absolute inset-0 z-0 cursor-move transition-shadow ${selectedId === 'background' ? 'ring-4 ring-indigo-500 ring-inset' : ''}`}
              onMouseDown={(e) => handleDragStart(e, 'background')}
              style={{
                backgroundImage: `url(${bgImage})`,
                backgroundSize: `${bgTransform.scale}%`,
                backgroundPosition: `calc(50% + ${bgTransform.x}px) calc(50% + ${bgTransform.y}px)`,
                backgroundRepeat: 'no-repeat'
              }}
            >
              {selectedId === 'background' && (
                <div 
                  onMouseDown={(e) => handleResizeStart(e, 'background')}
                  className="absolute bottom-10 right-10 w-12 h-12 bg-indigo-600 rounded-full shadow-2xl cursor-nwse-resize flex items-center justify-center z-50 hover:scale-110 transition-transform"
                >
                  <Plus className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
          )}

          {/* Text Items */}
          {textItems.map((item) => (
            <motion.div
              key={item.id}
              className={`absolute cursor-move select-none p-4 rounded-xl transition-all ${selectedId === item.id ? 'ring-2 ring-indigo-500 bg-indigo-50/10' : 'hover:bg-black/5'}`}
              onMouseDown={(e) => handleDragStart(e, item.id)}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.width}%`,
                transform: `translate(-50%, -50%) scale(${item.scale})`,
                textAlign: item.align,
                color: item.color,
                fontFamily: fontStyle === 'serif' ? 'Georgia, serif' : 'Inter, sans-serif',
                fontSize: `${item.fontSize}px`,
                fontWeight: item.fontWeight,
                fontStyle: item.fontStyle,
                zIndex: selectedId === item.id ? 100 : 10,
                lineHeight: item.type === 'title' ? '1.1' : '1.4',
                textTransform: item.type === 'title' ? 'uppercase' : 'none',
                letterSpacing: item.type === 'title' ? '-0.02em' : 'normal'
              }}
            >
              {item.content}
              {selectedId === item.id && (
                <div 
                  onMouseDown={(e) => handleResizeStart(e, item.id)}
                  className="absolute -bottom-2 -right-2 w-6 h-6 bg-indigo-600 rounded-full shadow-lg cursor-nwse-resize flex items-center justify-center"
                >
                  <div className="w-2 h-2 bg-white rounded-sm" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Floating Settings Popup */}
        <AnimatePresence>
          {selectedId && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed bg-white border border-zinc-200 rounded-3xl shadow-2xl p-6 flex flex-col gap-6 z-[200] w-72"
              style={{ left: popupPos.x, top: popupPos.y }}
            >
              <div 
                onMouseDown={handlePopupDragStart}
                className="flex items-center justify-between p-2 -mt-4 -mx-4 cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-600 transition-colors border-b border-zinc-100 mb-2"
              >
                <div className="flex items-center gap-2 px-2">
                  <GripHorizontal className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(null);
                  }}
                  className="p-1 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedId === 'background' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Background</label>
                    <button onClick={() => setBgTransform({ scale: 100, x: 0, y: 0 })} className="text-[10px] text-indigo-600 font-bold">Reset</button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                      <span>Scale</span>
                      <span>{Math.round(bgTransform.scale)}%</span>
                    </div>
                    <input 
                      type="range" min="10" max="500" value={bgTransform.scale} 
                      onChange={(e) => setBgTransform(prev => ({ ...prev, scale: parseInt(e.target.value) }))}
                      className="w-full h-1.5 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Edit Text</label>
                    <textarea
                      value={textItems.find(i => i.id === selectedId)?.content || ''}
                      onChange={(e) => updateItem(selectedId, { content: e.target.value })}
                      className="w-full p-3 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Align</label>
                      <div className="flex bg-zinc-50 p-1 rounded-lg">
                        {(['left', 'center', 'right', 'justify'] as const).map(a => {
                          const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : a === 'right' ? AlignRight : AlignJustify;
                          return (
                            <button 
                              key={a} onClick={() => updateItem(selectedId, { align: a })}
                              className={`flex-1 p-2 rounded-md transition-all ${textItems.find(i => i.id === selectedId)?.align === a ? 'bg-white shadow-sm text-indigo-600' : 'text-zinc-400'}`}
                            >
                              <Icon className="w-4 h-4 mx-auto" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Style</label>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => updateItem(selectedId, { fontWeight: textItems.find(i => i.id === selectedId)?.fontWeight === 'bold' ? 'normal' : 'bold' })}
                          className={`flex-1 p-2 rounded-lg border transition-all ${textItems.find(i => i.id === selectedId)?.fontWeight === 'bold' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-zinc-200 text-zinc-400'}`}
                        >
                          <Bold className="w-4 h-4 mx-auto" />
                        </button>
                        <button 
                          onClick={() => updateItem(selectedId, { fontStyle: textItems.find(i => i.id === selectedId)?.fontStyle === 'italic' ? 'normal' : 'italic' })}
                          className={`flex-1 p-2 rounded-lg border transition-all ${textItems.find(i => i.id === selectedId)?.fontStyle === 'italic' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-zinc-200 text-zinc-400'}`}
                        >
                          <Italic className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      <span>Font Size</span>
                      <span className="text-indigo-600">{Math.round(textItems.find(i => i.id === selectedId)?.fontSize || 0)}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="8" 
                      max="200" 
                      value={textItems.find(i => i.id === selectedId)?.fontSize || 16} 
                      onChange={(e) => updateItem(selectedId, { fontSize: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Color</label>
                    <div className="flex justify-between">
                      {['#000000', '#FFFFFF', '#4F46E5', '#059669', '#DC2626', '#D97706'].map(c => (
                        <button
                          key={c} onClick={() => updateItem(selectedId, { color: c })}
                          className={`w-6 h-6 rounded-full border border-zinc-200 transition-transform hover:scale-125 ${textItems.find(i => i.id === selectedId)?.color === c ? 'ring-2 ring-indigo-500 ring-offset-2 scale-125' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button 
                onClick={() => setSelectedId(null)}
                className="w-full py-3 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                DONE
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d4d4d8; }
      `}</style>
    </div>
  );
}
