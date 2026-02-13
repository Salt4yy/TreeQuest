'use client';

import React, { useEffect, useCallback, useState, useMemo } from 'react';
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
import { Check, Plus, Lock, X, Edit2, Save, Link as LinkIcon, Unlink, Trash2, ChevronLeft, ChevronRight, Folder, FolderTree, Crosshair, User, HelpCircle } from 'lucide-react';

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
    `;
    document.head.appendChild(style);
  }
}
import { supabase } from '@/lib/supabase'; 

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
};

type QuestLink = {
  parent_id: string;
  child_id: string;
};

type QuestNodeData = {
  label: string;
  icon?: string;
  status: VisualStatus;
  isSource?: boolean; // Si le noeud est sélectionné comme parent en mode liaison
};

// --- 1. COMPOSANT NOEUD (CERCLE) ---
type QuestNodeType = Node<QuestNodeData, 'quest'>;
const QuestNode = (props: NodeProps<QuestNodeType>) => {
  const { data } = props;
  if (!data) return null;
  const nodeData: QuestNodeData = data;
  const isCompleted = nodeData.status === 'completed';
  const isLocked = nodeData.status === 'locked';
  const isSource = nodeData.isSource; // Le noeud est-il sélectionné pour créer un lien ?

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
  
  // Style spécial quand on le sélectionne comme Parent
  if (isSource) {
    borderColor = '#00ffff'; // Cyan brillant
    scale = 'scale-110';
    bgColor = '#003366'; // Fond bleu foncé
  }

  return (
    <div className={`relative group transition-transform duration-200 ${isLocked ? 'opacity-90' : 'hover:scale-105'} ${scale}`}>
      {/* 
        HANDLE UNIQUE AU CENTRE : 
        Cela permet aux lignes de pointer vers le centre géométrique.
        Comme le noeud est au-dessus (z-index), la ligne s'arrête visuellement au bord.
      */}
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />
      <Handle type="source" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0 }} />

      <div
        className={`flex items-center justify-center rounded-full border-[5px] z-10 relative shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${isSource ? 'animate-pulse' : ''}`}
        style={{ 
          width: 80, height: 80, 
          borderColor, backgroundColor: bgColor,
          boxShadow: isSource ? '0 0 25px #00ffff, 0 0 50px #00ffff' : '' 
        }}
      >
        <span className="text-3xl z-10 select-none" style={{ color: iconColor }}>
          {isLocked ? <Lock size={24} /> : (nodeData.icon || '📦')}
        </span>
      </div>

      {isCompleted && !isSource && (
        <div className="absolute top-0 right-0 bg-[#55ff55] rounded-full p-1 shadow-md z-20 border-2 border-black translate-x-1 -translate-y-1">
          <Check size={14} className="text-black font-extrabold" strokeWidth={4} />
        </div>
      )}
    </div>
  );
};

const nodeTypes = { quest: QuestNode as React.ComponentType<NodeProps<Node<QuestNodeData, 'quest'>>> };

// --- 2. MODALE DE CONFIRMATION DE SUPPRESSION ---
const ConfirmDeleteModal = ({ 
  onConfirm, 
  onCancel 
}: { 
  onConfirm: () => void, 
  onCancel: () => void 
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
  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div 
        className="bg-[#3b3b3b] border-4 border-[#1a1a1a] shadow-2xl p-6 font-mono text-white min-w-[400px]"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3 className="text-xl font-bold text-red-400 mb-2">Suppression</h3>
          <p className="text-gray-300">Voulez-vous vraiment supprimer cette quête ?</p>
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

  useEffect(() => {
    if (quest) {
      setEditedTitle(quest.title);
      setEditedDesc(quest.description || '');
      setIsEditing(false);
    }
  }, [quest]);

  if (!quest) return null;

  const handleSave = () => {
    onUpdate(quest.id, { title: editedTitle, description: editedDesc });
    setIsEditing(false);
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

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className="w-[600px] bg-[#3b3b3b] border-2 border-[#1a1a1a] shadow-2xl flex flex-col font-mono text-white"
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
        <div className="p-4 bg-[#212121] min-h-[120px]">
           {isEditing ? (
             <textarea value={editedDesc} onChange={(e) => setEditedDesc(e.target.value)} className="w-full h-full bg-[#1a1a1a] border border-[#555] p-2 text-white text-sm min-h-[100px]" />
           ) : (
             <p className="text-gray-300 text-sm whitespace-pre-wrap">{quest.description || "Aucune description."}</p>
           )}
        </div>
      </div>
    </div>
  );
};

// --- 4. LOGIQUE PRINCIPALE ---
function QuestTree({ currentTreeId }: { currentTreeId: string | null }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<QuestNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  // DONNÉES LOCALES
  const [localQuests, setLocalQuests] = useState<Quest[]>([]);
  const [localLinks, setLocalLinks] = useState<QuestLink[]>([]); // Nouvelle table de liens
  
  // ÉTATS UI
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null); // ID du parent sélectionné
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  const { screenToFlowPosition, fitView } = useReactFlow();

  // 1. Initialisation (Charger Quêtes ET Liens pour l'arbre actuel)
  useEffect(() => {
    // Vider instantanément l'arbre pour éviter les flashs visuels
    setLocalQuests([]);
    setLocalLinks([]);
    setNodes([]);
    setEdges([]);
    setSelectedQuest(null);
    setLinkSourceId(null);
    
    const init = async () => {
      if (!currentTreeId) {
        return;
      }
      
      try {
        const { data: qData } = await supabase
          .from('quests')
          .select('id, title, description, status, position_x, position_y, tree_id')
          .eq('tree_id', currentTreeId);
        
        const { data: lData } = await supabase
          .from('quest_links')
          .select('*');
        
        if (qData && qData.length > 0) {
          const questIds = qData.map(q => q.id);
          // Filtrer les liens pour ne garder que ceux entre quêtes de cet arbre
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
  }, [currentTreeId, setNodes, setEdges]);

  // 2. Calcul des nodes et edges (useMemo : recalc uniquement si localQuests, localLinks, linkSourceId changent)
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
        icon: q.title.includes('Début') ? '🌲' : q.title.includes('Pierre') ? '⛏️' : '📜',
        isSource: linkSourceId === q.id,
      },
    }));

    // Edges directionnelles : verrouillé = pointillés gris, disponible = bleu animé, terminé = vert épais + flèche
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
  }, [localQuests, localLinks, linkSourceId, currentTreeId]);

  useEffect(() => {
    setNodes(computedNodesAndEdges.nodes);
    setEdges(computedNodesAndEdges.edges);
  }, [computedNodesAndEdges, setNodes, setEdges]);

  // 3. Sauvegarde Position
  const onNodeDragStop = useCallback(async (_: any, node: Node<QuestNodeData>) => {
    setLocalQuests(prev => prev.map(q => q.id === node.id ? { ...q, position_x: node.position.x, position_y: node.position.y } : q));
    await supabase.from('quests').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id);
  }, []);

  // 4. INTERACTION NOEUD (Click Handler Central)
  const onNodeClick = useCallback(async (_: any, node: Node<QuestNodeData>) => {
    // CAS A : MODE LIAISON ACTIF
    if (isLinkingMode) {
      if (!linkSourceId) {
        // Étape 1 : On sélectionne le Parent
        setLinkSourceId(node.id);
      } else {
        // Étape 2 : On sélectionne l'Enfant (Création du lien)
        if (node.id === linkSourceId) {
             setLinkSourceId(null); // Annuler si on reclique sur le même
             return;
        }

        // Vérifier si le lien existe déjà
        const exists = localLinks.some(l => l.parent_id === linkSourceId && l.child_id === node.id);
        if (!exists) {
            // Création Locale
            const newLink = { parent_id: linkSourceId, child_id: node.id };
            setLocalLinks(prev => [...prev, newLink]);
            // Création DB
            await supabase.from('quest_links').insert(newLink);
        }
        
        // On reste en mode source selectionné ou on reset ? Resettons pour être propre.
        setLinkSourceId(null); 
      }
      return;
    }

    // CAS B : MODE NORMAL (Ouvrir Modale)
    const quest = localQuests.find(q => q.id === node.id);
    if (quest) setSelectedQuest(quest);

  }, [isLinkingMode, linkSourceId, localLinks, localQuests]);


  // Fonction récursive pour collecter tous les descendants d'une quête
  const getAllDescendants = useCallback((questId: string, visited: Set<string> = new Set()): string[] => {
    if (visited.has(questId)) return [];
    visited.add(questId);
    
    // Filtrer uniquement les liens où cette quête est parente
    const directChildren = localLinks
      .filter(link => link.parent_id === questId)
      .map(link => link.child_id)
      .filter(childId => !visited.has(childId)); // Éviter les cycles
    
    const allDescendants: string[] = [...directChildren];
    
    // Récursion sur chaque enfant pour obtenir les petits-enfants, etc.
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

  // 5. FONCTIONS DE MODIFICATION
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

    await supabase.from('quests').update({ status: newStatus }).in('id', questsToUpdate);
  }, [localQuests, localLinks, getAllDescendants]);

  const handleUpdateQuest = useCallback(async (id: string, updates: Partial<Quest>) => {
    setLocalQuests(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
    setSelectedQuest(prev => prev && prev.id === id ? { ...prev, ...updates } : prev);
    await supabase.from('quests').update(updates).eq('id', id);
  }, []);

  const handleDeleteQuest = useCallback((questId: string) => {
    setShowDeleteConfirm(questId);
  }, []);

  const confirmDeleteQuest = useCallback(async (questId: string) => {
    setShowDeleteConfirm(null);
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
  }, [localLinks]);

  const handleAddQuest = useCallback(async () => {
    if (!currentTreeId) return;
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newQuest = {
      title: 'Nouvelle Quête',
      status: 'available',
      position_x: center.x,
      position_y: center.y,
      tree_id: currentTreeId,
    };
    const { data } = await supabase.from('quests').insert(newQuest).select().single();
    if (data) setLocalQuests(prev => [...prev, data as Quest]);
  }, [currentTreeId, screenToFlowPosition]);

  const canCompleteSelected = useMemo(() => {
    if (!selectedQuest) return false;
    const parentsIds = localLinks.filter(l => l.child_id === selectedQuest.id).map(l => l.parent_id);
    if (parentsIds.length === 0) return true;
    return parentsIds.every(pid => localQuests.find(q => q.id === pid)?.status === 'completed');
  }, [selectedQuest, localLinks, localQuests]);

  // Handler pour les connexions via drag & drop (si utilisé)
  const onConnect = useCallback(async (params: any) => {
    if (!params.source || !params.target) return;
    
    // Vérifier que les deux nœuds appartiennent à l'arbre actuel
    const sourceQuest = localQuests.find(q => q.id === params.source);
    const targetQuest = localQuests.find(q => q.id === params.target);
    
    if (!sourceQuest || !targetQuest || sourceQuest.tree_id !== currentTreeId || targetQuest.tree_id !== currentTreeId) {
      return;
    }
    
    // Vérifier si le lien existe déjà
    const exists = localLinks.some(l => l.parent_id === params.source && l.child_id === params.target);
    if (!exists) {
      const newLink = { parent_id: params.source, child_id: params.target };
      setLocalLinks(prev => [...prev, newLink]);
      await supabase.from('quest_links').insert(newLink);
    }
  }, [localQuests, localLinks, currentTreeId]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.6 }}
        minZoom={0.1}
        maxZoom={3}
        panOnDrag={true}
        zoomOnScroll={true}
        panOnScroll={false}
      >
        <Controls showZoom={false} showInteractive={false} showFitView={false} position="bottom-right" className="bg-[#333] border-2 border-[#111] shadow-xl rounded-none" />
        <Panel position="bottom-right" className="mb-2 mr-2">
          <button
            type="button"
            onClick={() => fitView({ duration: 800, padding: 0.6 })}
            className="flex items-center justify-center w-10 h-10 font-mono border-2 bg-[#2d2d2d] text-gray-300 hover:text-white hover:bg-[#3a3a3a] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] border-t-[#444] border-l-[#444] border-r-[#1a1a1a] border-b-[#1a1a1a] shadow-[2px_2px_0_0_#0d0d0d] hover:shadow-[3px_3px_0_0_#0d0d0d] transition-all"
            title="Centrer l'arbre"
          >
            <Crosshair size={20} />
          </button>
        </Panel>
        <Panel position="top-right" className="p-4 flex gap-4">
          {/* INSTRUCTIONS FLOTTANTES MODE LIAISON */}
          {isLinkingMode && (
             <div className="bg-black/80 text-white px-3 py-2 rounded border border-blue-500 animate-pulse text-sm font-mono">
                {linkSourceId ? "Cliquez sur l'ENFANT" : "Cliquez sur le PARENT"}
             </div>
          )}

          <button 
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
  isEditing,
  editedName,
  onNameChange,
  onSaveEdit,
  onCancelEdit
}: { 
  label: string, 
  icon?: React.ComponentType<{ size?: number; className?: string }>, 
  isActive?: boolean,
  isIndented?: boolean,
  onClick?: () => void,
  onEdit?: () => void,
  isEditing?: boolean,
  editedName?: string,
  onNameChange?: (value: string) => void,
  onSaveEdit?: () => void,
  onCancelEdit?: () => void
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
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#444] rounded transition-opacity"
            >
              <Edit2 size={14} className="text-gray-400 hover:text-white" />
            </button>
          )}
        </>
      )}
    </div>
  );
};

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

  // Charger les catégories et arbres
  useEffect(() => {
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
          // Forcer la sélection du premier arbre si aucun n'est sélectionné
          if (!currentTreeId) {
            setCurrentTreeId(treesData[0].id);
          }
        } else {
          // Aucun arbre dans la base - ne pas planter
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
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order_index)) : 0;
    const { data } = await supabase
      .from('quest_categories')
      .insert({ name: newCategoryName, order_index: maxOrder + 1 })
      .select()
      .single();
    
    if (data) {
      setCategories(prev => [...prev, data as QuestCategory]);
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    }
  };

  const handleAddTree = async () => {
    if (!newTreeName.trim() || !selectedCategoryId) {
      setShowNewTreeInput(false);
      setSelectedCategoryId(null);
      setNewTreeName('');
      return;
    }
    const categoryTrees = trees.filter(t => t.category_id === selectedCategoryId);
    const maxOrder = categoryTrees.length > 0 ? Math.max(...categoryTrees.map(t => t.order_index)) : 0;
    const { data } = await supabase
      .from('quest_trees')
      .insert({ name: newTreeName, category_id: selectedCategoryId, order_index: maxOrder + 1 })
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
    if (!editingName.trim() || editingType !== 'category') {
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
    if (!editingName.trim() || editingType !== 'tree') {
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

  const groupedTrees = categories.map(cat => ({
    category: cat,
    trees: trees.filter(t => t.category_id === cat.id).sort((a, b) => a.order_index - b.order_index)
  }));

  const SIDEBAR_WIDTH = 256;

  return (
    <div className="flex h-screen w-screen bg-[#101010] text-white font-sans overflow-hidden">
      {/* Sidebar avec transition de largeur */}
      <aside
        className="flex flex-col z-20 border-r border-[#333] overflow-hidden shrink-0"
        style={{
          width: isSidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          minWidth: isSidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          backgroundColor: '#1e1e1e',
          transition: 'width 0.3s ease',
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
            {groupedTrees.map(({ category, trees: categoryTrees }, index) => (
              <div key={category.id} className="group">
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
                      className="opacity-0 group-hover:opacity-100 p-1 mr-2 hover:bg-[#444] rounded transition-opacity"
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
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-mono text-gray-300 hover:text-white border-l-4 border-transparent hover:border-blue-500 hover:bg-[#2d2d2d] transition-all"
              style={{ backgroundColor: '#1e1e1e' }}
            >
              <HelpCircle size={18} className="text-gray-400 shrink-0" />
              Tutoriel
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-mono text-gray-300 hover:text-white border-l-4 border-transparent hover:border-blue-500 hover:bg-[#2d2d2d] transition-all"
              style={{ backgroundColor: '#1e1e1e' }}
            >
              <User size={18} className="text-gray-400 shrink-0" />
              Compte
            </button>
          </div>
        </aside>

      {/* Bouton flottant pour rouvrir la sidebar */}
      {isSidebarCollapsed && (
        <button
          onClick={() => setIsSidebarCollapsed(false)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-[#212121] border-r-2 border-t-2 border-b-2 border-[#000] p-2 hover:bg-[#2a2a2a] transition-all"
        >
          <ChevronRight size={18} className="text-gray-400 hover:text-white" />
        </button>
      )}

      <main 
        className="flex-1 min-w-0 relative h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        <ReactFlowProvider>
          <QuestTree currentTreeId={currentTreeId} />
        </ReactFlowProvider>
      </main>
    </div>
  );
}