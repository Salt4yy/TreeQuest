'use client';

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';

import {
  ReactFlow,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Check,
  Plus,
  Lock,
  X,
  Edit2,
  Save,
  Link as LinkIcon,
  Unlink,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderTree,
  Crosshair,
  User,
  HelpCircle,
  Mail,
  MessageSquare,
} from 'lucide-react';

// Animation des pointillés (edges) : défilement vers l'enfant via stroke-dashoffset
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.id = 'quest-edges-dash-animation';
  if (!document.getElementById(style.id)) {
    style.textContent = `
      .react-flow__edge.animated-dash .react-flow__edge-path {
        animation: edge-dash-offset 0.8s linear infinite;
      }
      @keyframes edge-dash-offset {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: -20; }
      }
      
      /* Fade-in animation pour les edges */
      .react-flow__edge {
        animation: edge-fade-in 0.4s ease-out;
      }
      @keyframes edge-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Custom Scrollbars style Minecraft
  const scrollbarStyle = document.createElement('style');
  scrollbarStyle.id = 'custom-scrollbars';
  if (!document.getElementById(scrollbarStyle.id)) {
    scrollbarStyle.textContent = `
      /* Scrollbar Webkit (Chrome, Safari, Edge) */
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ::-webkit-scrollbar-track {
        background: #1a1a1a;
        border: 1px solid #0d0d0d;
      }
      ::-webkit-scrollbar-thumb {
        background: #444;
        border: 1px solid #2a2a2a;
        box-shadow: inset 1px 1px 0 rgba(255,255,255,0.1);
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #555;
      }
      ::-webkit-scrollbar-corner {
        background: #1a1a1a;
      }
      
      /* Scrollbar Firefox */
      * {
        scrollbar-width: thin;
        scrollbar-color: #444 #1a1a1a;
      }
    `;
    document.head.appendChild(scrollbarStyle);
  }
  
  // Masquer l'attribution React Flow
  const hideAttribution = document.createElement('style');
  hideAttribution.id = 'hide-reactflow-attribution';
  if (!document.getElementById(hideAttribution.id)) {
    hideAttribution.textContent = `
      .react-flow__attribution {
        display: none !important;
      }
    `;
    document.head.appendChild(hideAttribution);
  }
}
import { supabase } from '@/lib/supabase';
import type { User as AuthUser } from '@supabase/supabase-js';

// --- TYPES ---
type DbStatus = 'available' | 'completed';
type VisualStatus = 'locked' | 'available' | 'completed';

type QuestCategory = {
  id: string;
  name: string;
  order_index: number;
};

type QuestTree = {
  id: string;
  name: string;
  category_id: string;
  order_index: number;
};

type Quest = {
  id: string;
  title: string;
  description: string | null;
  status: DbStatus;
  position_x: number;
  position_y: number;
  tree_id: string;
  icon?: string | null; // émoji
};

type QuestLink = {
  parent_id: string;
  child_id: string;
};

type QuestNodeData = {
  label: string;
  icon?: string; // émoji
  status: VisualStatus;
  isSource?: boolean;
  isDragging?: boolean;
};

// --- Bibliothèque d'émojis étendue (+100, style Minecraft/FTB) ---
const EMOJI_BY_THEME: Record<string, string[]> = {
  "Outils & Combat": ["⛏️", "🪓", "🗡️", "⚔️", "🛡️", "🏹", "🔫", "🧨", "💣", "🔧", "🔨", "🪛", "🔩", "⚙️", "⛓️", "🧲", "🎣", "🔭", "🔬"],
  "Ressources & Blocs": ["💎", "🪵", "🧱", "🪨", "🩸", "💧", "🔥", "🧊", "⚡", "🔋", "🛢️", "📦", "📜", "⚱️", "🏺", "🛒", "🪙"],
  "Nature & Animaux": ["🌲", "🌳", "🌵", "🍄", "🌹", "🌻", "🌿", "🍀", "🍁", "🐉", "🦕", "🦖", "🐺", "🦊", "🐻", "🦄", "🦅", "🦇", "🕷️", "🕸️"],
  "Nourriture & Potions": ["🍎", "🍖", "🍗", "🥩", "🍞", "🧀", "🍕", "🍔", "🍺", "🍷", "🧪", "⚗️", "🍼", "🍪", "🎂", "🍬", "🍫", "🍯"],
  "Magie & Mystique": ["✨", "🔮", "🧿", "⚰️", "💀", "👻", "👽", "👾", "🧙", "🧚", "🧞", "🧛", "🧟", "🌑", "🌕", "🌟", "💫", "☄️"],
  "Tech & Redstone": ["💻", "🖥️", "🖨️", "🖱️", "💾", "💿", "📱", "📷", "📹", "📺", "📻", "📡", "🚀", "🛸", "🤖", "🖲️", "🔌", "💡"],
  "Symboles & UI": ["✅", "❌", "⚠️", "⛔", "🚩", "🏁", "🏆", "🥇", "🎯", "👑", "❤️", "💙", "💚", "💛", "💜", "🖤", "💯", "💢", "💤"],
  "Transport & Base": ["🏠", "🏰", "⛺", "🏭", "🏥", "🚀", "🚁", "✈️", "🚗", "🏎️", "🚂", "⛵", "🚤", "⚓", "🗺️", "🛏️", "🚪"]
};

// --- 1. COMPOSANT NOEUD (CERCLE) avec React.memo pour optimisation ---
type QuestNodeType = Node<QuestNodeData, 'quest'>;
const QuestNode = React.memo((props: NodeProps<QuestNodeType>) => {
  const { data } = props;
  if (!data) return null;
  const nodeData: QuestNodeData = data;
  const isCompleted = nodeData.status === 'completed';
  const isLocked = nodeData.status === 'locked';
  const isSource = nodeData.isSource;
  const isDragging = nodeData.isDragging;

  let borderColor = '#0099ff'; 
  let bgColor = '#2d2d2d';
  let iconColor = 'white';
  let scale = 'scale-100';

  if (isLocked) {
    borderColor = '#444'; bgColor = '#1a1a1a'; iconColor = '#555';
  }
  if (isCompleted) {
    borderColor = '#55ff55'; bgColor = '#2d2d2d'; iconColor = 'white';
  }
  
  if (isSource) {
    borderColor = '#00ffff';
    scale = 'scale-110';
    bgColor = '#003366';
  }

  // EFFET DE SOULEVÉ ADOUCI
  let flyingTransform = '';
  let flyingShadow = '';
  if (isDragging) {
    scale = 'scale-[1.05]'; // Réduit de 1.15 à 1.05
    flyingTransform = 'translateY(-8px)'; // Réduit de -12px à -8px
    flyingShadow = '0 12px 24px rgba(0,0,0,0.4), 0 0 20px rgba(0,150,255,0.2)'; // Ombre plus subtile
  }

  return (
    <div 
      className={`relative group transition-all duration-200 flex flex-col items-center ${isLocked ? 'opacity-90' : 'hover:scale-105'} ${scale}`}
      style={{ 
        transform: flyingTransform,
        transition: 'transform 0.2s ease-out'
      }}
    >
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
      <Handle type="source" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />

      <div
        className={`flex items-center justify-center rounded-full border-[5px] z-10 relative ${isSource ? 'animate-pulse' : ''}`}
        style={{ 
          width: 80, height: 80, 
          borderColor, 
          backgroundColor: bgColor,
          boxShadow: flyingShadow || (isSource ? '0 0 25px #00ffff, 0 0 50px #00ffff' : '0 4px 10px rgba(0,0,0,0.5)'),
          transition: 'box-shadow 0.2s ease-out'
        }}
      >
        <span className="text-3xl z-10 select-none flex items-center justify-center" style={{ color: iconColor, opacity: isLocked ? 0.5 : 1, filter: isLocked ? 'grayscale(100%)' : 'none' }}>
          {nodeData.icon || '📦'}
        </span>
      </div>

      <p
        className="font-mono text-sm text-white text-center max-w-[100px] mt-2 leading-tight select-none pointer-events-none"
        style={{
          textShadow: '0 1px 4px #000, 0 2px 8px rgba(0,0,0,0.98), 0 0 12px rgba(0,0,0,0.95)',
        }}
      >
        {nodeData.label || 'Quête'}
      </p>

      {isCompleted && !isSource && (
        <div className="absolute top-0 right-0 bg-[#55ff55] rounded-full p-1 shadow-md z-20 border-2 border-black translate-x-1 -translate-y-1">
          <Check size={14} className="text-black font-extrabold" strokeWidth={4} />
        </div>
      )}
    </div>
  );
});
QuestNode.displayName = 'QuestNode';

const nodeTypes = { quest: QuestNode as React.ComponentType<NodeProps<Node<QuestNodeData, 'quest'>>> };

// --- 2a. MODALE AUTH (OAuth uniquement) style Minecraft ---
const AuthModal = ({ onClose }: { onClose: () => void }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'google' | 'discord' | null>(null);
  const [mounted, setMounted] = useState(false);
  const backdropRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const mouseDownOnBackdrop = React.useRef(false);
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) mouseDownOnBackdrop.current = true;
  };
  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && mouseDownOnBackdrop.current) onClose();
    mouseDownOnBackdrop.current = false;
  };

  const handleOAuth = async (provider: 'google' | 'discord') => {
    setError(null);
    setLoading(provider);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { 
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined 
        },
      });
      if (err) throw err;
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 z-[75] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className={`bg-[#2a2a2a] border-4 border-[#1a1a1a] shadow-[6px_6px_0_0_#0d0d0d] font-mono text-white min-w-[340px] max-w-[400px] transition-all duration-200 ${mounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        style={{ boxShadow: '4px 4px 0 0 #0d0d0d' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b-4 border-[#1a1a1a] text-center">
          <p className="text-gray-300 text-sm">Connexion / Inscription</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={!!loading}
            className="flex items-center justify-center gap-3 w-full py-4 bg-[#2d2d2d] border-4 border-[#444] border-t-[#555] border-l-[#555] hover:bg-[#3a3a3a] hover:border-[#555] disabled:opacity-60 text-white font-mono font-bold text-sm transition-all shadow-[3px_3px_0_0_#0d0d0d] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Mail size={22} className="shrink-0" />
            Continuer avec Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('discord')}
            disabled={!!loading}
            className="flex items-center justify-center gap-3 w-full py-4 bg-[#2d2d2d] border-4 border-[#444] border-t-[#555] border-l-[#555] hover:bg-[#3a3a3a] hover:border-[#555] disabled:opacity-60 text-white font-mono font-bold text-sm transition-all shadow-[3px_3px_0_0_#0d0d0d] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          >
            <MessageSquare size={22} className="shrink-0" />
            Continuer avec Discord
          </button>
          {error && (
            <p className="text-red-300 text-sm font-medium bg-red-950/50 border-2 border-red-500/60 px-3 py-2 rounded">
              {error}
            </p>
          )}
          <button type="button" onClick={onClose} className="mt-1 py-2 text-gray-400 hover:text-white font-mono text-sm">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 2b. MODALE DE CONFIRMATION DE SUPPRESSION GÉNÉRIQUE ---
const ConfirmDeleteModal = ({ 
  title = 'Suppression',
  message,
  onConfirm, 
  onCancel 
}: { 
  title?: string;
  message: string;
  onConfirm: () => void; 
  onCancel: () => void; 
}) => {
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const mouseDownOnBackdrop = React.useRef(false);
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) mouseDownOnBackdrop.current = true;
  };
  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && mouseDownOnBackdrop.current) {
      onCancel();
    }
    mouseDownOnBackdrop.current = false;
  };
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div 
        className={`bg-[#3b3b3b] border-4 border-[#1a1a1a] shadow-2xl p-6 font-mono text-white min-w-[400px] transition-all duration-200 ${mounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3 className="text-xl font-bold text-red-400 mb-2">{title}</h3>
          <p className="text-gray-300">{message}</p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-[#555] border-2 border-[#333] hover:bg-[#666] text-white font-bold transition-all"
          >
            NON
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-[#8b0000] border-2 border-[#660000] hover:bg-[#a00000] text-white font-bold transition-all"
          >
            OUI
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 3. MODALE DETAILS ---
const QuestModal = ({ 
  quest, onClose, onUpdate, onToggleStatus, onDelete, canComplete
}: { 
  quest: Quest | null, 
  onClose: () => void, 
  onUpdate: (id: string, updates: Partial<Quest>) => void,
  onToggleStatus: (quest: Quest) => void,
  onDelete: (id: string) => void,
  canComplete: boolean
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDesc, setEditedDesc] = useState('');
  const [editedIcon, setEditedIcon] = useState<string>('📦');
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  
  // CORRECTIF : Utiliser un ref pour tracker l'ID précédent et éviter le reset pendant l'édition
  const prevQuestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!quest) {
      prevQuestIdRef.current = null;
      return;
    }
    
    if (quest.id !== prevQuestIdRef.current) {
      // Nouvelle quête, reset complet
      setEditedTitle(quest.title);
      setEditedDesc(quest.description || '');
      setEditedIcon(quest.icon || '📦');
      setIsEditing(false);
      setEmojiPopoverOpen(false);
      prevQuestIdRef.current = quest.id;
    }
    // Si même quête, ne rien faire pour éviter de reset pendant l'édition d'emoji
  }, [quest]);

  if (!quest) return null;

  const handleSave = () => {
    onUpdate(quest.id, {
      title: editedTitle,
      description: editedDesc,
      icon: editedIcon || null,
    });
    setIsEditing(false);
  };

  const applyEmoji = (emoji: string) => {
    setEditedIcon(emoji);
    onUpdate(quest.id, { icon: emoji });
    setEmojiPopoverOpen(false);
  };

  const isCompleted = quest.status === 'completed';
  const validationClickable = isCompleted || canComplete;

  const backdropRef = React.useRef<HTMLDivElement>(null);
  const mouseDownOnBackdrop = React.useRef(false);
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) mouseDownOnBackdrop.current = true;
  };
  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && mouseDownOnBackdrop.current) onClose();
    mouseDownOnBackdrop.current = false;
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!quest) return;
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [quest]);

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className={`w-[600px] max-h-[90vh] bg-[#3b3b3b] border-2 border-[#1a1a1a] shadow-2xl flex flex-col font-mono text-white transition-all duration-200 overflow-hidden ${mounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="bg-[#2a2a2a] p-2 border-b-2 border-[#1a1a1a] flex justify-between items-center h-12">
          <div className="flex items-center gap-2 flex-1">
             <div className="w-6 h-6 bg-blue-600 border border-white/20 rounded flex items-center justify-center text-xs">Q</div>
             {isEditing ? (
               <input value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} className="bg-[#1a1a1a] border border-[#555] px-2 py-1 text-white w-full max-w-[300px]" autoFocus />
             ) : (
               <span className="font-bold text-lg truncate">{quest.title}</span>
             )}
          </div>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <button onClick={handleSave} className="p-1 hover:bg-[#444] rounded text-green-400"><Save size={18} /></button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-[#444] rounded text-gray-400 hover:text-white"><Edit2 size={16} /></button>
            )}
            <button 
              onClick={() => onDelete(quest.id)} 
              className="p-1 hover:bg-red-900/50 rounded text-red-500 hover:text-red-400"
              title="Supprimer la quête"
            >
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-red-900/50 rounded text-red-400"><X size={20} /></button>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-[#1a1a1a] bg-[#252525] font-mono text-sm">
          <span className="text-gray-400 shrink-0">Icône</span>
          <span className="flex items-center justify-center w-11 h-11 rounded border-2 border-[#444] bg-[#1a1a1a] text-2xl">
            {editedIcon}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmojiPopoverOpen((o) => !o)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#2d2d2d] border-2 border-[#55ff55]/50 hover:border-[#55ff55] hover:bg-[#333] text-[#55ff55] font-mono font-bold text-sm shadow-[2px_2px_0_0_#0d0d0d] transition-colors"
            >
              <span className="text-lg leading-none">{editedIcon}</span>
              Changer l&apos;icône
            </button>
            {emojiPopoverOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setEmojiPopoverOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-[300px] max-h-[320px] overflow-y-auto bg-[#2a2a2a] border-4 border-[#1a1a1a] shadow-[4px_4px_0_0_#0d0d0d] p-2 font-mono">
                  {Object.entries(EMOJI_BY_THEME).map(([theme, emojis]) => (
                    <div key={theme} className="mb-2">
                      <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wider">{theme}</p>
                      <div className="grid grid-cols-8 gap-0.5">
                        {emojis.map((emoji, emojiIndex) => (
                          <button
                            key={`${theme}-${emojiIndex}`}
                            type="button"
                            onClick={() => applyEmoji(emoji)}
                            className="w-8 h-8 flex items-center justify-center text-lg border-2 border-[#444] bg-[#1a1a1a] hover:bg-[#3a3a3a] hover:border-[#555]"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex border-b-2 border-[#1a1a1a] h-32 bg-[#333]">
          <div className="w-1/2 border-r-2 border-[#1a1a1a] p-2 flex flex-col items-center justify-center">
             <div 
               className={`flex items-center gap-3 p-3 border-2 rounded transition-all w-full ${
                 !validationClickable ? 'bg-[#252525] border-[#444] cursor-not-allowed opacity-80' :
                 isCompleted ? 'bg-[#1a3a1a] border-[#55ff55] cursor-pointer' : 'bg-[#2a2a2a] border-[#555] hover:bg-[#333] cursor-pointer'
               }`} 
               onClick={() => validationClickable && onToggleStatus(quest)}
             >
                <div className={`w-8 h-8 flex items-center justify-center border-2 rounded ${isCompleted ? 'border-[#55ff55]' : 'border-gray-500'}`}>
                  {isCompleted ? <Check size={20} className="text-[#55ff55]" /> : <span className="text-gray-500 text-xs">?</span>}
                </div>
                <div className="flex flex-col">
                   <span className={isCompleted ? 'text-[#55ff55]' : 'text-gray-300'}>Validation</span>
                   <span className="text-[10px] text-gray-500">
                     {isCompleted ? 'Completed' : !canComplete ? 'Complete parents first' : 'Click to complete'}
                   </span>
                </div>
             </div>
          </div>
          <div className="w-1/2 p-2 bg-[#2b2b2b] opacity-50 flex items-center justify-center text-gray-500 italic text-xs">Rewards coming soon...</div>
        </div>
        <div className="p-4 bg-[#212121] flex-1 min-h-[200px] flex flex-col overflow-y-auto">
           {isEditing ? (
             <textarea
               value={editedDesc}
               onChange={(e) => setEditedDesc(e.target.value)}
               className="w-full min-h-[200px] bg-[#0d0d0d] border-4 border-[#333] border-t-[#555] border-l-[#555] p-3 text-white text-sm font-mono resize-y focus:outline-none focus:border-[#55ff55]/50 transition-colors shadow-[inset_2px_2px_4px_rgba(0,0,0,0.5)]"
               placeholder="Décrivez cette quête..."
             />
           ) : (
             <p className="text-gray-300 text-sm whitespace-pre-wrap">{quest.description || "Aucune description."}</p>
           )}
        </div>
      </div>
    </div>
  );
};

// --- 4. LOGIQUE PRINCIPALE ---
type TutorialTargetRefs = {
  addButtonRef?: React.RefObject<HTMLButtonElement | null>;
  linkButtonRef?: React.RefObject<HTMLButtonElement | null>;
  crosshairButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

// NOUVELLE FONCTION : Résolution des collisions en cascade
const resolveOverlaps = (nodes: Node<QuestNodeData>[], draggedNodeId: string): Node<QuestNodeData>[] => {
  const NODE_RADIUS = 40; // Rayon du cercle (80px / 2)
  const PADDING = 20; // Espace minimum entre nœuds
  const ITERATIONS = 4; // Itérations pour stabiliser les cascades
  
  let updatedNodes = [...nodes];
  
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let hasMovement = false;
    
    for (let i = 0; i < updatedNodes.length; i++) {
      for (let j = i + 1; j < updatedNodes.length; j++) {
        const node1 = updatedNodes[i];
        const node2 = updatedNodes[j];
        
        const dx = node1.position.x - node2.position.x;
        const dy = node1.position.y - node2.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (NODE_RADIUS + PADDING) * 2;
        
        if (distance < minDistance && distance > 0) {
          hasMovement = true;
          const overlap = minDistance - distance;
          const angle = Math.atan2(dy, dx);
          
          const pushNode1 = node1.id !== draggedNodeId;
          const pushNode2 = node2.id !== draggedNodeId;
          
          if (pushNode1 && pushNode2) {
            // Aucun n'est le nœud déplacé, pousser les deux
            const halfPush = overlap / 2;
            updatedNodes[i] = {
              ...node1,
              position: {
                x: node1.position.x + Math.cos(angle) * halfPush,
                y: node1.position.y + Math.sin(angle) * halfPush
              }
            };
            updatedNodes[j] = {
              ...node2,
              position: {
                x: node2.position.x - Math.cos(angle) * halfPush,
                y: node2.position.y - Math.sin(angle) * halfPush
              }
            };
          } else if (pushNode1) {
            // Pousser uniquement node1 (node2 est déplacé)
            updatedNodes[i] = {
              ...node1,
              position: {
                x: node1.position.x + Math.cos(angle) * overlap,
                y: node1.position.y + Math.sin(angle) * overlap
              }
            };
          } else if (pushNode2) {
            // Pousser uniquement node2 (node1 est déplacé)
            updatedNodes[j] = {
              ...node2,
              position: {
                x: node2.position.x - Math.cos(angle) * overlap,
                y: node2.position.y - Math.sin(angle) * overlap
              }
            };
          }
        }
      }
    }
    
    // Optimisation : arrêter si aucun mouvement à cette itération
    if (!hasMovement) break;
  }
  
  return updatedNodes;
};

function QuestTree({ currentTreeId, tutorialTargetRefs, userId }: { currentTreeId: string | null; tutorialTargetRefs?: TutorialTargetRefs; userId?: string | null }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<QuestNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const [localQuests, setLocalQuests] = useState<Quest[]>([]);
  const [localLinks, setLocalLinks] = useState<QuestLink[]>([]);
  
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  
  const hasInitializedView = useRef(false);
  
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();

  useEffect(() => {
    setLocalQuests([]);
    setLocalLinks([]);
    setNodes([]);
    setEdges([]);
    setSelectedQuest(null);
    setLinkSourceId(null);
    hasInitializedView.current = false;
    
    const init = async () => {
      if (!currentTreeId || !userId) return;
      
      try {
        const { data: qData } = await supabase
          .from('quests')
          .select('id, title, description, status, position_x, position_y, tree_id, icon')
          .eq('tree_id', currentTreeId);
        
        const { data: lData } = await supabase
          .from('quest_links')
          .select('*');
        
        if (qData && qData.length > 0) {
          const questIds = qData.map(q => q.id);
          const filteredLinks = (lData || []).filter(
            (link: QuestLink) => questIds.includes(link.parent_id) && questIds.includes(link.child_id)
          );
          setLocalQuests(qData as Quest[]);
          setLocalLinks(filteredLinks);
        } else {
          setLocalQuests([]);
          setLocalLinks([]);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des quêtes:', error);
        setLocalQuests([]);
        setLocalLinks([]);
      }
    };
    init();
  }, [currentTreeId, userId, setNodes, setEdges]);

  const computedNodesAndEdges = useMemo(() => {
    if (localQuests.length === 0 || !currentTreeId) {
      return { nodes: [] as Node<QuestNodeData>[], edges: [] as Edge[] };
    }

    const nodeStatusMap = new Map<string, VisualStatus>();
    localQuests.forEach(q => {
      const parentsIds = localLinks.filter(l => l.child_id === q.id).map(l => l.parent_id);
      let visualStatus: VisualStatus = q.status;
      if (parentsIds.length > 0) {
        const allParentsCompleted = parentsIds.every(pid => {
          const parent = localQuests.find(pq => pq.id === pid);
          return parent?.status === 'completed';
        });
        if (!allParentsCompleted) visualStatus = 'locked';
      }
      nodeStatusMap.set(q.id, visualStatus);
    });

    const newNodes: Node<QuestNodeData>[] = localQuests.map((q) => ({
      id: q.id.toString(),
      type: 'quest',
      position: { x: q.position_x, y: q.position_y },
      data: {
        label: q.title,
        status: nodeStatusMap.get(q.id) || 'available',
        icon: q.icon || '📦',
        isSource: linkSourceId === q.id,
        isDragging: draggingNodeId === q.id,
      },
    }));

    const newEdges: Edge[] = localLinks.map((link): Edge => {
      const parent = localQuests.find(q => q.id === link.parent_id);
      const child = localQuests.find(q => q.id === link.child_id);
      const isParentCompleted = parent?.status === 'completed';
      const isChildCompleted = child?.status === 'completed';

      let strokeColor = '#555';
      let strokeWidth = 3;
      let strokeDasharray: string | undefined;
      let animated = false;

      let className: string | undefined;
      if (!isParentCompleted) {
        strokeColor = '#555';
        strokeDasharray = '5,5';
        animated = true;
        className = 'animated-dash';
      } else if (isChildCompleted) {
        strokeColor = '#55ff55';
        strokeWidth = 5;
        animated = false;
      } else {
        strokeColor = '#0099ff';
        strokeWidth = 4;
        animated = true;
      }

      return {
        id: `e-${link.parent_id}-${link.child_id}`,
        source: link.parent_id,
        target: link.child_id,
        type: 'straight',
        animated,
        className,
        style: { stroke: strokeColor, strokeWidth, strokeDasharray },
        markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
        zIndex: -1,
      };
    });

    return { nodes: newNodes, edges: newEdges };
  }, [localQuests, localLinks, linkSourceId, draggingNodeId, currentTreeId]);

  useEffect(() => {
    setNodes(computedNodesAndEdges.nodes);
    setEdges(computedNodesAndEdges.edges);
  }, [computedNodesAndEdges, setNodes, setEdges]);

  useEffect(() => {
    if (currentTreeId && computedNodesAndEdges.nodes.length > 0 && !hasInitializedView.current) {
      fitView({ duration: 500, padding: 1.4 });
      hasInitializedView.current = true;
    }
  }, [currentTreeId, computedNodesAndEdges.nodes.length, fitView]);

  const onNodeDragStart = useCallback((_: any, node: Node<QuestNodeData>) => {
    setDraggingNodeId(node.id);
  }, []);

  // CORRECTION : Sauvegarde avec résolution de collisions en cascade
  const onNodeDragStop = useCallback(async (_: any, node: Node<QuestNodeData>) => {
    setDraggingNodeId(null);
    
    if (!userId) return;
    
    const currentNodes = getNodes() as Node<QuestNodeData>[];
    
    // Résoudre les chevauchements en cascade
    const resolvedNodes = resolveOverlaps(currentNodes, node.id);
    
    // Mettre à jour les nœuds avec les nouvelles positions
    setNodes(resolvedNodes);
    
    // Mettre à jour l'état local
    setLocalQuests(prev => prev.map(q => {
      const matchingNode = resolvedNodes.find(n => n.id === q.id);
      if (matchingNode) {
        return {
          ...q,
          position_x: matchingNode.position.x,
          position_y: matchingNode.position.y,
        };
      }
      return q;
    }));
    
    // Sauvegarder en BDD
    const updatePromises = resolvedNodes.map(async (n) => {
      const quest = localQuests.find(q => q.id === n.id);
      if (quest && (quest.position_x !== n.position.x || quest.position_y !== n.position.y)) {
        return supabase
          .from('quests')
          .update({ position_x: n.position.x, position_y: n.position.y })
          .eq('id', n.id);
      }
      return null;
    });
    
    await Promise.all(updatePromises.filter(p => p !== null));
  }, [userId, localQuests, getNodes, setNodes, setLocalQuests]);

  const onNodeClick = useCallback(async (_: any, node: Node<QuestNodeData>) => {
    if (isLinkingMode) {
      if (!linkSourceId) {
        setLinkSourceId(node.id);
      } else {
        if (node.id === linkSourceId) {
             setLinkSourceId(null);
             return;
        }

        const exists = localLinks.some(l => l.parent_id === linkSourceId && l.child_id === node.id);
        if (!exists && userId) {
            const newLink = { parent_id: linkSourceId, child_id: node.id };
            setLocalLinks(prev => [...prev, newLink]);
            await supabase.from('quest_links').insert(newLink);
        }
        
        setLinkSourceId(null); 
      }
      return;
    }

    const quest = localQuests.find(q => q.id === node.id);
    if (quest) setSelectedQuest(quest);

  }, [isLinkingMode, linkSourceId, localLinks, localQuests, userId]);

  const getAllDescendants = useCallback((questId: string, visited: Set<string> = new Set()): string[] => {
    if (visited.has(questId)) return [];
    visited.add(questId);
    
    const directChildren = localLinks
      .filter(link => link.parent_id === questId)
      .map(link => link.child_id)
      .filter(childId => !visited.has(childId));
    
    const allDescendants: string[] = [...directChildren];
    
    directChildren.forEach(childId => {
      const childDescendants = getAllDescendants(childId, visited);
      childDescendants.forEach(descId => {
        if (!allDescendants.includes(descId)) {
          allDescendants.push(descId);
        }
      });
    });
    
    return allDescendants;
  }, [localLinks]);

  const handleToggleStatus = useCallback(async (quest: Quest) => {
    const newStatus: DbStatus = quest.status === 'completed' ? 'available' : 'completed';

    if (newStatus === 'completed') {
      const parentsIds = localLinks.filter(l => l.child_id === quest.id).map(l => l.parent_id);
      const allParentsCompleted = parentsIds.every(pid => {
        const p = localQuests.find(q => q.id === pid);
        return p?.status === 'completed';
      });
      if (!allParentsCompleted) return;
    }

    const questsToUpdate: string[] = [quest.id];
    if (newStatus === 'available') {
      const descendants = getAllDescendants(quest.id);
      questsToUpdate.push(...descendants);
    }

    setLocalQuests(prev => prev.map(q =>
      questsToUpdate.includes(q.id) ? { ...q, status: newStatus } : q
    ));
    setSelectedQuest(prev => prev && questsToUpdate.includes(prev.id) ? { ...prev, status: newStatus } : prev);

    if (userId) await supabase.from('quests').update({ status: newStatus }).in('id', questsToUpdate);
  }, [localQuests, localLinks, getAllDescendants, userId]);

  const handleUpdateQuest = useCallback(async (id: string, updates: Partial<Quest>) => {
    if (!userId) return;
    setLocalQuests(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    setSelectedQuest(prev => prev && prev.id === id ? { ...prev, ...updates } : prev);
    await supabase.from('quests').update(updates).eq('id', id);
  }, [userId]);

  const handleDeleteQuest = useCallback((questId: string) => {
    setShowDeleteConfirm(questId);
  }, []);

  const confirmDeleteQuest = useCallback(async (questId: string) => {
    setShowDeleteConfirm(null);
    if (!userId) return;
    const linksToDelete = localLinks.filter(
      link => link.parent_id === questId || link.child_id === questId
    );
    setLocalQuests(prev => prev.filter(q => q.id !== questId));
    setLocalLinks(prev => prev.filter(
      link => link.parent_id !== questId && link.child_id !== questId
    ));
    setSelectedQuest(prev => (prev?.id === questId ? null : prev));
    await supabase.from('quests').delete().eq('id', questId);
    for (const link of linksToDelete) {
      await supabase.from('quest_links').delete().eq('parent_id', link.parent_id).eq('child_id', link.child_id);
    }
  }, [localLinks, userId]);

  const handleAddQuest = useCallback(async () => {
    if (!currentTreeId || !userId) return;
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newQuest = {
      title: 'Nouvelle Quête',
      description: null,
      status: 'available' as DbStatus,
      position_x: center.x,
      position_y: center.y,
      tree_id: currentTreeId,
      user_id: userId,
      icon: '📦',
    };
    const { data } = await supabase.from('quests').insert(newQuest).select().single();
    if (data) setLocalQuests(prev => [...prev, data as Quest]);
  }, [currentTreeId, screenToFlowPosition, userId]);

  const canCompleteSelected = useMemo(() => {
    if (!selectedQuest) return false;
    const parentsIds = localLinks.filter(l => l.child_id === selectedQuest.id).map(l => l.parent_id);
    if (parentsIds.length === 0) return true;
    return parentsIds.every(pid => localQuests.find(q => q.id === pid)?.status === 'completed');
  }, [selectedQuest, localLinks, localQuests]);

  // NOUVELLE FONCTION : Gestion des connexions avec vérification bidirectionnelle
  const onConnect = useCallback(async (params: any) => {
    if (!params.source || !params.target || !userId) return;
    
    const sourceQuest = localQuests.find(q => q.id === params.source);
    const targetQuest = localQuests.find(q => q.id === params.target);
    
    if (!sourceQuest || !targetQuest || sourceQuest.tree_id !== currentTreeId || targetQuest.tree_id !== currentTreeId) {
      return;
    }
    
    // Vérifier si le lien inverse existe
    const reverseLink = localLinks.find(l => l.parent_id === params.target && l.child_id === params.source);
    
    if (reverseLink) {
      // Supprimer le lien inverse
      setLocalLinks(prev => prev.filter(l => !(l.parent_id === params.target && l.child_id === params.source)));
      await supabase.from('quest_links').delete()
        .eq('parent_id', params.target)
        .eq('child_id', params.source);
    }
    
    // Vérifier si le lien existe déjà
    const exists = localLinks.some(l => l.parent_id === params.source && l.child_id === params.target);
    if (!exists) {
      const newLink = { parent_id: params.source, child_id: params.target };
      setLocalLinks(prev => [...prev, newLink]);
      await supabase.from('quest_links').insert(newLink);
    }
  }, [localQuests, localLinks, currentTreeId, userId]);

  // NOUVELLE FONCTION : Suppression de lien au clic
  const onEdgeClick = useCallback(async (_: any, edge: Edge) => {
    if (!userId) return;
    
    const confirmed = window.confirm("Supprimer ce lien ?");
    if (!confirmed) return;
    
    // Extraire parent_id et child_id de l'id de l'edge (format: e-{parent_id}-{child_id})
    const parts = edge.id.split('-');
    if (parts.length !== 3) return;
    
    const parentId = parts[1];
    const childId = parts[2];
    
    // Supprimer de l'état local
    setLocalLinks(prev => prev.filter(l => !(l.parent_id === parentId && l.child_id === childId)));
    
    // Supprimer de la BDD
    await supabase.from('quest_links').delete()
      .eq('parent_id', parentId)
      .eq('child_id', childId);
  }, [userId]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        fitView
        fitViewOptions={{ padding: 1.4 }}
        minZoom={0.1}
        maxZoom={3}
        panOnDrag={true}
        zoomOnScroll={true}
        panOnScroll={false}
      >
        <Controls showZoom={false} showInteractive={false} showFitView={false} position="bottom-right" className="bg-[#333] border-2 border-[#111] shadow-xl rounded-none" />
        <Panel position="bottom-right" className="mb-2 mr-2">
          <button
            ref={tutorialTargetRefs?.crosshairButtonRef}
            type="button"
            onClick={() => fitView({ duration: 800, padding: 1.4 })}
            className="flex items-center justify-center w-10 h-10 font-mono border-2 bg-[#2d2d2d] text-gray-300 hover:text-white hover:bg-[#3a3a3a] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] border-t-[#444] border-l-[#444] border-r-[#1a1a1a] border-b-[#1a1a1a] shadow-[2px_2px_0_0_#0d0d0d] hover:shadow-[3px_3px_0_0_#0d0d0d] transition-all"
            title="Centrer l'arbre"
          >
            <Crosshair size={20} />
          </button>
        </Panel>
        <Panel position="top-right" className="p-4 flex gap-4">
          {isLinkingMode && (
             <div className="bg-black/80 text-white px-3 py-2 rounded border border-blue-500 animate-pulse text-sm font-mono">
                {linkSourceId ? "Cliquez sur l'ENFANT" : "Cliquez sur le PARENT"}
             </div>
          )}

          <button
            ref={tutorialTargetRefs?.linkButtonRef}
            onClick={() => { setIsLinkingMode(!isLinkingMode); setLinkSourceId(null); }}
            className={`
              flex items-center gap-2 px-4 py-2 font-mono text-sm uppercase font-bold transition-all
              border-t-2 border-l-2 border-[#888] border-r-2 border-b-2 border-[#111] bg-[#2d2d2d]
              text-gray-300 hover:text-white hover:bg-[#3a3a3a]
              active:border-t-2 active:border-l-2 active:border-[#111] active:border-r-2 active:border-b-2 active:border-[#888]
              active:translate-x-[1px] active:translate-y-[1px] active:shadow-none
              shadow-[2px_2px_0_0_#0d0d0d]
              ${isLinkingMode ? 'text-white bg-blue-600 border-blue-400' : ''}
            `}
          >
            {isLinkingMode ? <Unlink size={18} /> : <LinkIcon size={18} />}
            {isLinkingMode ? 'Arrêter Liaison' : 'Lier Quêtes'}
          </button>

          <button
            ref={tutorialTargetRefs?.addButtonRef}
            onClick={handleAddQuest}
            className="flex items-center gap-2 px-4 py-2 font-mono text-sm uppercase font-bold transition-all
              border-t-2 border-l-2 border-[#888] border-r-2 border-b-2 border-[#111] bg-[#2d2d2d]
              text-[#55ff55] hover:bg-[#3a3a3a] hover:text-[#66ff66]
              active:border-t-2 active:border-l-2 active:border-[#111] active:border-r-2 active:border-b-2 active:border-[#888]
              active:translate-x-[1px] active:translate-y-[1px] active:shadow-none
              shadow-[2px_2px_0_0_#0d0d0d]"
          >
            <Plus size={18} /> Ajouter
          </button>
        </Panel>
      </ReactFlow>

      {selectedQuest && (
        <QuestModal 
           quest={selectedQuest} 
           onClose={() => setSelectedQuest(null)} 
           onUpdate={handleUpdateQuest}
           onToggleStatus={handleToggleStatus}
           onDelete={handleDeleteQuest}
           canComplete={canCompleteSelected}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          message="Voulez-vous vraiment supprimer cette quête ?"
          onConfirm={() => confirmDeleteQuest(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// --- SIDEBAR ITEM COMPONENT ---
const SidebarItem = ({ 
  label, 
  icon: Icon, 
  isActive = false, 
  isIndented = false,
  onClick,
  onEdit,
  onDelete,
  isEditing,
  editedName,
  onNameChange,
  onSaveEdit,
  onCancelEdit
}: { 
  label: string; 
  icon?: React.ComponentType<{ size?: number; className?: string }>; 
  isActive?: boolean;
  isIndented?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  editedName?: string;
  onNameChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
}) => {
  return (
    <div
      className={`
        flex items-center gap-2 px-4 py-2 cursor-pointer transition-all group
        ${isActive ? 'border-l-4 border-blue-500' : 'border-l-4 border-transparent hover:bg-[#2d2d2d]'}
        ${isIndented ? 'pl-8' : ''}
      `}
      style={{ backgroundColor: isActive ? '#2d2d2d' : undefined }}
      onClick={onClick}
    >
      {Icon && <Icon size={18} className={isActive ? 'text-blue-400' : 'text-gray-400'} />}
      {isEditing ? (
        <input
          value={editedName}
          onChange={(e) => onNameChange?.(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit?.();
            if (e.key === 'Escape') onCancelEdit?.();
          }}
          className="flex-1 bg-[#1a1a1a] border border-[#555] px-2 py-1 text-white text-sm font-mono"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className={`text-sm font-mono flex-1 ${isActive ? 'text-white font-bold' : 'text-gray-300'}`}>
            {label}
          </span>
          <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1 hover:bg-[#444] rounded"
              >
                <Edit2 size={14} className="text-gray-400 hover:text-white" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 hover:bg-red-900/40 rounded"
                title="Supprimer"
              >
                <Trash2 size={14} className="text-red-500/90 hover:text-red-400" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// --- TUTORIEL MIS À JOUR avec étape suppression de lien ---
type TutorialTarget = 'center' | 'sidebar' | 'navigation' | 'add' | 'link' | 'node' | 'crosshair' | 'add_tree' | 'add_category';
const TUTORIAL_STEPS: { text: string; target: TutorialTarget }[] = [
  { text: "Bienvenue dans l'Éditeur de Quêtes ! Tu vas créer des aventures en chaînes de tâches. Suis le guide de A à Z.", target: 'center' },
  { text: "Étape 1 — Catégories : Clique sur « Ajouter Catégorie » pour créer un dossier thématique (ex : Chapitre 1, Projet X).", target: 'add_category' },
  { text: "Étape 2 — Arbres (chapitres) : Survole une catégorie et clique sur le petit « + » pour créer un arbre de quêtes à l'intérieur.", target: 'add_tree' },
  { text: "Étape 3 — Nœuds (tâches) : Clique sur « Ajouter » pour poser ta première quête au centre de la grille. Répète pour construire ton arbre.", target: 'add' },
  { text: "Navigation : Molette pour zoomer, clic-glissé pour te déplacer sur la grille. Tu peux t'éloigner pour voir l'ensemble.", target: 'navigation' },
  { text: "Étape 4 — Liaison : Active « Lier Quêtes », puis clique sur le parent puis sur l'enfant. Les flèches définissent l'ordre de déblocage.", target: 'link' },
  { text: "Une erreur de liaison ? Clique simplement sur un trait pour le supprimer.", target: 'center' },
  { text: "Personnalisation : Clique sur une quête pour ouvrir son détail. Tu peux changer le titre, l'icône (émoji) et la description.", target: 'node' },
  { text: "Progression : Valide une tâche dans la modale pour la passer en vert. Les quêtes suivantes (enfants) se débloquent au fur et à mesure.", target: 'node' },
  { text: "Astuce : Le bouton cible (⊕) recentre la vue sur tout l'arbre. Bonne aventure !", target: 'crosshair' },
];

const TutorialBubble = ({ text, onNext, onQuit, isLastStep }: { text: string; onNext: () => void; onQuit: () => void; isLastStep?: boolean }) => (
  <div
    className="font-mono text-white p-4 max-w-sm border-4 border-[#1a1a1a] shadow-[4px_4px_0_0_#0d0d0d]"
    style={{ backgroundColor: '#2a2a2a' }}
  >
    <p className="text-sm leading-relaxed mb-4">{text}</p>
    <div className="flex gap-2 justify-end">
      <button
        type="button"
        onClick={onQuit}
        className="px-3 py-1.5 bg-[#555] border-2 border-[#333] hover:bg-[#666] text-white text-sm font-bold transition-all"
      >
        Quitter
      </button>
      <button
        type="button"
        onClick={onNext}
        className="px-3 py-1.5 bg-[#3a5a3a] border-2 border-[#2a4a2a] hover:bg-[#4a6a4a] text-white text-sm font-bold transition-all"
      >
        {isLastStep ? 'Terminer' : 'Suivant'}
      </button>
    </div>
  </div>
);

// --- WRAPPER ---
export default function Page() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [categories, setCategories] = useState<QuestCategory[]>([]);
  const [trees, setTrees] = useState<QuestTree[]>([]);
  const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState<'category' | 'tree' | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTreeName, setNewTreeName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [showNewTreeInput, setShowNewTreeInput] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'category' | 'tree'; id: string; name: string } | null>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [localQuests, setLocalQuests] = useState<Quest[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const sidebarRef = React.useRef<HTMLElement>(null);
  const categoryRowRef = React.useRef<HTMLDivElement>(null);
  const mainRef = React.useRef<HTMLDivElement>(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const linkButtonRef = React.useRef<HTMLButtonElement>(null);
  const crosshairButtonRef = React.useRef<HTMLButtonElement>(null);
  const addCategoryButtonRef = React.useRef<HTMLButtonElement>(null);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (tutorialStep === null) {
      setSpotlightRect(null);
      return;
    }
    const step = TUTORIAL_STEPS[tutorialStep];
    if (!step) {
      setSpotlightRect(null);
      return;
    }
    
    if (step.target === 'node' && localQuests.length === 0) {
      setSpotlightRect(null);
      return;
    }
    
    if (step.target === 'center') {
      setSpotlightRect(null);
      return;
    }
    const el =
      step.target === 'sidebar' ? sidebarRef.current :
      step.target === 'add_category' ? addCategoryButtonRef.current :
      step.target === 'add_tree' ? categoryRowRef.current :
      step.target === 'navigation' || step.target === 'node' ? mainRef.current :
      step.target === 'add' ? addButtonRef.current :
      step.target === 'link' ? linkButtonRef.current :
      step.target === 'crosshair' ? crosshairButtonRef.current :
      null;
    if (el) {
      setSpotlightRect(el.getBoundingClientRect());
    } else {
      setSpotlightRect(null);
    }
  }, [tutorialStep, localQuests.length]);

  const tutorialTargetRefs: TutorialTargetRefs = useMemo(() => ({
    addButtonRef,
    linkButtonRef,
    crosshairButtonRef,
  }), []);

  useEffect(() => {
    if (!user) {
      setCategories([]);
      setTrees([]);
      setCurrentTreeId(null);
      return;
    }
    const loadData = async () => {
      try {
        const { data: cats } = await supabase
          .from('quest_categories')
          .select('*')
          .order('order_index');
        
        const { data: treesData } = await supabase
          .from('quest_trees')
          .select('*')
          .order('order_index');
        
        if (cats) setCategories(cats as QuestCategory[]);
        if (treesData && treesData.length > 0) {
          setTrees(treesData as QuestTree[]);
          if (!currentTreeId) setCurrentTreeId(treesData[0].id);
        } else {
          setTrees([]);
          setCurrentTreeId(null);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
        setCategories([]);
        setTrees([]);
        setCurrentTreeId(null);
      }
    };
    loadData();
  }, [user, currentTreeId]);

  useEffect(() => {
    if (!user || !currentTreeId) {
      setLocalQuests([]);
      return;
    }
    const loadQuests = async () => {
      const { data } = await supabase
        .from('quests')
        .select('id, title, description, status, position_x, position_y, tree_id, icon')
        .eq('tree_id', currentTreeId);
      if (data) setLocalQuests(data as Quest[]);
    };
    loadQuests();
  }, [user, currentTreeId]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user) return;
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order_index)) : 0;
    const { data } = await supabase
      .from('quest_categories')
      .insert({ name: newCategoryName, order_index: maxOrder + 1, user_id: user.id })
      .select()
      .single();
    
    if (data) {
      setCategories(prev => [...prev, data as QuestCategory]);
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    }
  };

  const handleAddTree = async () => {
    if (!newTreeName.trim() || !selectedCategoryId || !user) {
      setShowNewTreeInput(false);
      setSelectedCategoryId(null);
      setNewTreeName('');
      return;
    }
    const categoryTrees = trees.filter(t => t.category_id === selectedCategoryId);
    const maxOrder = categoryTrees.length > 0 ? Math.max(...categoryTrees.map(t => t.order_index)) : 0;
    const { data } = await supabase
      .from('quest_trees')
      .insert({ name: newTreeName, category_id: selectedCategoryId, order_index: maxOrder + 1, user_id: user.id })
      .select()
      .single();
    
    if (data) {
      setTrees(prev => [...prev, data as QuestTree]);
      setNewTreeName('');
      setShowNewTreeInput(false);
      setSelectedCategoryId(null);
      setCurrentTreeId(data.id);
    }
  };

  const handleRenameCategory = async (id: string) => {
    if (!user || !editingName.trim() || editingType !== 'category') {
      setEditingCategoryId(null);
      setEditingType(null);
      setEditingName('');
      return;
    }
    await supabase.from('quest_categories').update({ name: editingName }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editingName } : c));
    setEditingCategoryId(null);
    setEditingType(null);
    setEditingName('');
  };

  const handleRenameTree = async (id: string) => {
    if (!user || !editingName.trim() || editingType !== 'tree') {
      setEditingTreeId(null);
      setEditingType(null);
      setEditingName('');
      return;
    }
    await supabase.from('quest_trees').update({ name: editingName }).eq('id', id);
    setTrees(prev => prev.map(t => t.id === id ? { ...t, name: editingName } : t));
    setEditingTreeId(null);
    setEditingType(null);
    setEditingName('');
  };

  const deleteQuestLinksForQuestIds = async (questIds: string[]) => {
    for (const qid of questIds) {
      await supabase.from('quest_links').delete().or(`parent_id.eq.${qid},child_id.eq.${qid}`);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!user) return;
    const categoryTrees = trees.filter(t => t.category_id === categoryId);
    for (const tree of categoryTrees) {
      const { data: questsData } = await supabase.from('quests').select('id').eq('tree_id', tree.id);
      const questIds = (questsData || []).map((q: { id: string }) => q.id);
      if (questIds.length > 0) {
        await deleteQuestLinksForQuestIds(questIds);
        await supabase.from('quests').delete().eq('tree_id', tree.id);
      }
      await supabase.from('quest_trees').delete().eq('id', tree.id);
    }
    await supabase.from('quest_categories').delete().eq('id', categoryId);
    setTrees(prev => prev.filter(t => t.category_id !== categoryId));
    setCategories(prev => prev.filter(c => c.id !== categoryId));
    if (currentTreeId && categoryTrees.some(t => t.id === currentTreeId)) {
      const remaining = trees.filter(t => t.category_id !== categoryId);
      setCurrentTreeId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleDeleteTree = async (treeId: string) => {
    if (!user) return;
    const { data: questsData } = await supabase.from('quests').select('id').eq('tree_id', treeId);
    const questIds = (questsData || []).map((q: { id: string }) => q.id);
    if (questIds.length > 0) {
      await deleteQuestLinksForQuestIds(questIds);
      await supabase.from('quests').delete().eq('tree_id', treeId);
    }
    await supabase.from('quest_trees').delete().eq('id', treeId);
    setTrees(prev => prev.filter(t => t.id !== treeId));
    if (currentTreeId === treeId) {
      const remaining = trees.filter(t => t.id !== treeId);
      setCurrentTreeId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const groupedTrees = categories.map(cat => ({
    category: cat,
    trees: trees.filter(t => t.category_id === cat.id).sort((a, b) => a.order_index - b.order_index)
  }));

  const SIDEBAR_WIDTH = 256;

  const currentTutorialStep = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] : null;
  const isLastStep = tutorialStep !== null && tutorialStep >= TUTORIAL_STEPS.length - 1;
  
  const tutorialText = currentTutorialStep && currentTutorialStep.target === 'node' && localQuests.length === 0
    ? "Commence par créer quelques quêtes avec le bouton « Ajouter », puis tu pourras cliquer dessus pour les personnaliser."
    : currentTutorialStep?.text || '';

  return (
    <div className="flex h-screen w-screen bg-[#101010] text-white font-sans overflow-hidden">
      <aside
        ref={sidebarRef}
        className="flex flex-col z-20 border-r border-[#333] overflow-hidden shrink-0 transition-[width] duration-300 ease-in-out"
        style={{
          width: isSidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          minWidth: isSidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          backgroundColor: '#1e1e1e',
          transition: 'width 0.3s ease-in-out, min-width 0.3s ease-in-out',
          boxShadow: isSidebarCollapsed ? 'none' : '4px 0 15px rgba(0,0,0,0.6)',
        }}
      >
        <div className="p-4 border-b border-[#333] flex items-center justify-between shrink-0" style={{ backgroundColor: '#1e1e1e' }}>
          <span className="font-bold text-gray-200 text-sm font-mono">Quêtes</span>
          <button
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 min-w-0" style={{ backgroundColor: '#1e1e1e' }}>
          {categories.length === 0 && !showNewCategoryInput && (
            <div className="px-4 py-8 text-center">
              <p className="text-gray-500 text-sm font-mono mb-3">
                Aucune catégorie pour l&apos;instant.
              </p>
              <p className="text-gray-400 text-xs font-mono leading-relaxed">
                Commence par créer ta première catégorie pour organiser tes quêtes !
              </p>
            </div>
          )}
          
          {groupedTrees.map(({ category, trees: categoryTrees }, index) => (
            <div
              key={category.id}
              ref={index === 0 ? categoryRowRef : undefined}
              className="group"
            >
              {index > 0 && <div className="mx-3 my-1 border-t border-[#333]" />}
              <div className="flex items-center">
                <div className="flex-1">
                  <SidebarItem
                    label={category.name}
                    icon={Folder}
                    isEditing={editingCategoryId === category.id}
                    editedName={editingName}
                    onNameChange={setEditingName}
                    onSaveEdit={() => handleRenameCategory(category.id)}
                    onCancelEdit={() => {
                      setEditingCategoryId(null);
                      setEditingType(null);
                      setEditingName('');
                    }}
                    onEdit={() => {
                      setEditingCategoryId(category.id);
                      setEditingType('category');
                      setEditingName(category.name);
                    }}
                    onDelete={() => setDeleteConfirm({ type: 'category', id: category.id, name: category.name })}
                  />
                </div>
                {!showNewTreeInput && !editingCategoryId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNewTreeInput(true);
                      setShowNewCategoryInput(false);
                      setSelectedCategoryId(category.id);
                    }}
                    className={`p-1 mr-2 hover:bg-[#444] rounded transition-opacity ${
                      tutorialStep !== null && 
                      TUTORIAL_STEPS[tutorialStep]?.target === 'add_tree' && 
                      index === 0 
                        ? '!opacity-100' 
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Ajouter un arbre dans cette catégorie"
                  >
                    <Plus size={14} className="text-gray-400 hover:text-green-400" />
                  </button>
                )}
              </div>
              {categoryTrees.map(tree => (
                <SidebarItem
                  key={tree.id}
                  label={tree.name}
                  icon={FolderTree}
                  isIndented={true}
                  isActive={currentTreeId === tree.id}
                  onClick={() => setCurrentTreeId(tree.id)}
                  isEditing={editingTreeId === tree.id}
                  editedName={editingName}
                  onNameChange={setEditingName}
                  onSaveEdit={() => handleRenameTree(tree.id)}
                  onCancelEdit={() => {
                    setEditingTreeId(null);
                    setEditingType(null);
                    setEditingName('');
                  }}
                  onEdit={() => {
                    setEditingTreeId(tree.id);
                    setEditingType('tree');
                    setEditingName(tree.name);
                  }}
                  onDelete={() => setDeleteConfirm({ type: 'tree', id: tree.id, name: tree.name })}
                />
              ))}
              {showNewTreeInput && selectedCategoryId === category.id && (
                <div className="pl-8 px-4 py-2 border-l-2 border-blue-500 flex items-center gap-2">
                  <input
                    value={newTreeName}
                    onChange={(e) => setNewTreeName(e.target.value)}
                    onBlur={() => {
                      if (!newTreeName.trim()) {
                        setShowNewTreeInput(false);
                        setSelectedCategoryId(null);
                        setNewTreeName('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTree();
                      if (e.key === 'Escape') {
                        setShowNewTreeInput(false);
                        setSelectedCategoryId(null);
                        setNewTreeName('');
                      }
                    }}
                    placeholder="Nom de l'arbre..."
                    className="flex-1 min-w-0 bg-[#1a1a1a] border border-[#555] px-2 py-1 text-white text-sm font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTree()}
                    className="shrink-0 p-1.5 rounded bg-[#2d2d2d] border border-[#555] text-[#55ff55] hover:bg-[#3a3a3a] font-mono text-xs"
                    title="Ajouter"
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {showNewCategoryInput && (
            <div className="px-4 py-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') {
                    setShowNewCategoryInput(false);
                    setNewCategoryName('');
                  }
                }}
                placeholder="Nom de la catégorie..."
                className="w-full bg-[#1a1a1a] border border-[#555] px-2 py-1 text-white text-sm font-mono"
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="p-2 border-t border-[#333] flex flex-col gap-1 shrink-0" style={{ backgroundColor: '#1e1e1e' }}>
          <button
            ref={addCategoryButtonRef}
            onClick={() => {
              setShowNewCategoryInput(true);
              setShowNewTreeInput(false);
            }}
            className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] hover:bg-[#3a3a3a] text-gray-300 hover:text-white text-sm font-mono border border-t-[#444] border-l-[#444] border-r-[#222] border-b-[#222] active:border-[#222] active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            <Plus size={14} /> Ajouter Catégorie
          </button>
          <button
            type="button"
            onClick={() => setTutorialStep(0)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-mono text-gray-300 hover:text-white border-l-4 border-transparent hover:border-blue-500 hover:bg-[#2d2d2d] transition-all"
            style={{ backgroundColor: '#1e1e1e' }}
          >
            <HelpCircle size={18} className="text-gray-400 shrink-0" />
            Tutoriel
          </button>
          {user ? (
            <div className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-mono border-l-4 border-blue-500 bg-[#2d2d2d]" style={{ backgroundColor: '#1e1e1e' }}>
              <span className="text-gray-300 truncate" title={user.email ?? ''}>
                {user.email ? (user.email.length > 22 ? `${user.email.slice(0, 20)}…` : user.email) : 'Compte'}
              </span>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="shrink-0 px-2 py-1 text-xs bg-[#555] border border-[#444] hover:bg-[#666] text-white font-bold"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-mono text-gray-300 hover:text-white border-l-4 border-transparent hover:border-blue-500 hover:bg-[#2d2d2d] transition-all"
              style={{ backgroundColor: '#1e1e1e' }}
            >
              <User size={18} className="text-gray-400 shrink-0" />
              Se connecter
            </button>
          )}
        </div>
      </aside>

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      {deleteConfirm && (
        <ConfirmDeleteModal
          title="Suppression"
          message={
            deleteConfirm.type === 'category'
              ? `Supprimer la catégorie "${deleteConfirm.name}" ? Tous les arbres et quêtes associés seront supprimés.`
              : `Supprimer l'arbre "${deleteConfirm.name}" ? Toutes ses quêtes seront supprimées.`
          }
          onConfirm={async () => {
            if (deleteConfirm.type === 'category') await handleDeleteCategory(deleteConfirm.id);
            else await handleDeleteTree(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {isSidebarCollapsed && (
        <button
          onClick={() => setIsSidebarCollapsed(false)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-[#212121] border-r-2 border-t-2 border-b-2 border-[#000] p-2 hover:bg-[#2a2a2a] transition-all"
        >
          <ChevronRight size={18} className="text-gray-400 hover:text-white" />
        </button>
      )}

      <main
        ref={mainRef}
        className="flex-1 min-w-0 relative h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex items-center justify-center"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        {!user ? (
          <p className="font-mono text-gray-400 text-center text-lg px-4">
            Veuillez vous connecter pour créer votre aventure
          </p>
        ) : (
          <ReactFlowProvider>
            <QuestTree currentTreeId={currentTreeId} tutorialTargetRefs={tutorialTargetRefs} userId={user.id} />
          </ReactFlowProvider>
        )}
      </main>

      {/* NOUVEAU : Badge Discord */}
      <div className="fixed bottom-4 right-4 z-[80] flex items-center gap-3 bg-black/80 backdrop-blur-sm px-4 py-3 rounded-lg border border-gray-700 shadow-xl">
        <img 
          src="https://avatars.githubusercontent.com/u/221634597?v=4" 
          alt="Discord Avatar"
          className="w-10 h-10 rounded-full border-2 border-blue-500"
        />
        <div className="font-mono text-sm">
          <p className="text-gray-400">Bugs ou suggestions ?</p>
          <p className="text-white font-bold">Discord : salt4y</p>
        </div>
      </div>

      {tutorialStep !== null && currentTutorialStep && (
        <div className="fixed inset-0 z-[60] pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: spotlightRect ? 'transparent' : 'rgba(0,0,0,0.75)',
              pointerEvents: 'none',
            }}
            aria-hidden
          />
          {spotlightRect && (
            <>
              <div
                className="absolute pointer-events-none"
                style={{
                  left: spotlightRect.left - 8,
                  top: spotlightRect.top - 8,
                  width: spotlightRect.width + 16,
                  height: spotlightRect.height + 16,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
                  borderRadius: 4,
                }}
                aria-hidden
              />
              <span
                className="absolute text-[#55ff55] text-2xl font-bold animate-bounce pointer-events-none drop-shadow-[0_0_4px_#000]"
                style={{ left: spotlightRect.left + spotlightRect.width / 2 - 12, top: spotlightRect.top - 28 }}
                aria-hidden
              >
                ▼
              </span>
              <span
                className="absolute text-[#55ff55] text-2xl font-bold animate-bounce pointer-events-none drop-shadow-[0_0_4px_#000]"
                style={{ left: spotlightRect.left + spotlightRect.width / 2 - 12, top: spotlightRect.bottom + 4 }}
                aria-hidden
              >
                ▲
              </span>
              <span
                className="absolute text-[#55ff55] text-2xl font-bold animate-bounce pointer-events-none drop-shadow-[0_0_4px_#000]"
                style={{ left: spotlightRect.left - 28, top: spotlightRect.top + spotlightRect.height / 2 - 14 }}
                aria-hidden
              >
                ◀
              </span>
              <span
                className="absolute text-[#55ff55] text-2xl font-bold animate-bounce pointer-events-none drop-shadow-[0_0_4px_#000]"
                style={{ left: spotlightRect.right + 4, top: spotlightRect.top + spotlightRect.height / 2 - 14 }}
                aria-hidden
              >
                ▶
              </span>
            </>
          )}
          <div
            className="absolute inset-0 flex pointer-events-none"
            style={{
              alignItems: currentTutorialStep.target === 'center' || (currentTutorialStep.target === 'node' && localQuests.length === 0) ? 'center' : 'flex-end',
              justifyContent: 'center',
              paddingBottom: currentTutorialStep.target === 'center' || (currentTutorialStep.target === 'node' && localQuests.length === 0) ? 0 : 80,
            }}
          >
            <div className="pointer-events-auto">
              <TutorialBubble
                text={tutorialText}
                isLastStep={isLastStep}
                onNext={() => {
                  if (isLastStep) setTutorialStep(null);
                  else setTutorialStep((s) => (s ?? 0) + 1);
                }}
                onQuit={() => setTutorialStep(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
