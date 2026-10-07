import React, { useState, useEffect } from 'react';
import { 
  Film, 
  Layout, 
  Download, 
  Save, 
  User as UserIcon, 
  LogOut, 
  Loader2, 
  Cloud,
  Undo2,
  Redo2,
  Sparkles,
  Mic,
  Bookmark,
  Keyboard,
  Activity,
  Wand2,
  Check,
  RotateCcw,
  Scissors,
  Settings,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Edit2,
  CheckCircle2,
  Clock,
  Play,
  Menu,
  X,
  Truck
} from 'lucide-react';
import { useAuth } from '../../lib/firebase/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ConfirmModal } from '../common/ConfirmModal';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { GoogleDriveIcon } from '../GoogleDriveModal';
import { Cpu, Zap } from 'lucide-react';

function GoogleIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function ModernAuthStatus({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const { user, loading, isLoggingIn, login, logout, hasDriveAccess } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />;
  }
  
  if (!user) {
    return (
      <button 
        onClick={() => login()} 
        disabled={isLoggingIn}
        className={`w-full text-xs font-medium text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/60 hover:border-zinc-500 rounded-xl px-3 py-2 transition-all flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-start gap-2.5'} cursor-pointer ${isLoggingIn ? 'opacity-70 cursor-wait' : ''}`}
        title="Zaloguj się przez Google (synchronizacja Firestore & Dysk Google)"
      >
        <GoogleIcon className="w-4 h-4 shrink-0" />
        {!isCollapsed && (
          <span className="truncate">{isLoggingIn ? 'Logowanie...' : 'Zaloguj przez Google'}</span>
        )}
      </button>
    );
  }

  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`w-full flex items-center ${isCollapsed ? 'justify-center p-1.5' : 'justify-between p-2'} rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 transition-all cursor-pointer text-left`}
        title={`${user.displayName || user.email} • Synchronizacja aktywna`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700 relative shrink-0">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-300">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
            )}
            {hasDriveAccess && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950" title="Dysk Google połączony" />
            )}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-zinc-200 truncate">{user.displayName || 'Użytkownik'}</p>
              <p className="text-[10px] text-zinc-400 truncate">{user.email}</p>
            </div>
          )}
        </div>
      </button>

      {isMenuOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-zinc-900/95 border border-zinc-800 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col backdrop-blur-xl animate-fadeIn">
          <div className="px-2 py-2 border-b border-zinc-800/80 mb-1.5">
            <p className="text-xs text-white truncate font-medium">{user.displayName || 'Użytkownik'}</p>
            <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-[10px] text-emerald-400">
              <Cloud className="w-3 h-3 text-indigo-400" />
              <span>Dysk Google: {hasDriveAccess ? 'Aktywny' : 'Brak uprawnień'}</span>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setIsMenuOpen(false);
              login();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors w-full text-left cursor-pointer"
          >
            <GoogleIcon className="w-3.5 h-3.5" />
            <span>Odśwież token Dysku</span>
          </button>

          <button 
            onClick={() => {
              setIsMenuOpen(false);
              logout();
            }} 
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors w-full text-left mt-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Wyloguj się</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface StudioLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  projectName: string;
  onProjectNameChange?: (name: string) => void;
  isSaving: boolean;
  onSave: () => void;
  hasUnsavedChanges?: boolean;
  autoSaveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt?: string | null;
  secondsUntilAutoSave?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  recoveryAvailable?: boolean;
  onRestoreRecovery?: () => void;
  onDismissRecovery?: () => void;
  onResetProject?: () => void;
  onOpenAiAssistant?: () => void;
  onOpenDirector?: () => void;
  onToggleHealthPanel?: () => void;
  isHealthPanelOpen?: boolean;
  onOpenVoiceRecorder?: () => void;
  onOpenTemplateGallery?: () => void;
  onOpenCommandPalette?: () => void;
  isDbConnected?: boolean;
}

export function StudioLayout({ 
  children, 
  activeTab, 
  onTabChange, 
  projectName, 
  onProjectNameChange, 
  isSaving, 
  onSave, 
  hasUnsavedChanges = false, 
  autoSaveStatus = 'idle',
  lastSavedAt = null,
  secondsUntilAutoSave = 30,
  canUndo = false, 
  canRedo = false, 
  onUndo, 
  onRedo, 
  recoveryAvailable = false, 
  onRestoreRecovery, 
  onDismissRecovery, 
  onResetProject,
  onOpenAiAssistant, 
  onOpenDirector,
  onToggleHealthPanel,
  isHealthPanelOpen = false,
  onOpenVoiceRecorder, 
  onOpenTemplateGallery,
  onOpenCommandPalette,
  isDbConnected = true 
}: StudioLayoutProps) {
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(activeTab === 'montage');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const { isOnline } = useOnlineStatus();
  const { hasDriveAccess, login } = useAuth();

  // Keyboard shortcut Ctrl+B or Cmd+B to collapse/expand sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSidebarCollapsed(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFinishNameEdit = () => {
    setIsEditingName(false);
    if (tempName.trim() && onProjectNameChange) {
      onProjectNameChange(tempName.trim());
    }
  };

  const navItems = [
    { id: 'project', label: 'Projekt', icon: Layout, desc: 'Przegląd i parametry' },
    { id: 'media', label: 'Media', icon: Film, desc: 'Biblioteka 4K i Dysk' },
    { id: 'montage', label: 'Montaż', icon: Scissors, desc: 'Wielościeżkowa oś czasu' },
    { id: 'export', label: 'Eksport', icon: Download, desc: 'GPU WebCodecs 4K' },
    { id: 'settings', label: 'Ustawienia', icon: Settings, desc: 'Silnik, cache i chmura' },
  ];

  return (
    <div className="min-h-screen flex bg-[#09090b] text-[#f4f4f5] relative selection:bg-[#6366f1] selection:text-white overflow-x-hidden">
      {/* Background ambient lighting in Linear/Raycast style */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/3 w-[800px] h-[350px] bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent blur-[140px]" />
        <div className="absolute bottom-0 right-10 w-[500px] h-[400px] bg-emerald-500/5 blur-[160px]" />
      </div>

      {/* Mobile Slide-Out Drawer Backdrop & Menu */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fadeIn">
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs bg-zinc-950 border-r border-zinc-800 h-full flex flex-col justify-between p-4 z-10 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-bold text-white">KAPI-STUDIO</span>
                  <span className="text-[10px] text-zinc-400 block">Studio Postprodukcji 4K</span>
                </div>
              </div>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Tools */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block px-2">
                  Obszar Roboczy
                </span>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onTabChange(item.id);
                        setIsMobileDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        isActive 
                          ? 'bg-indigo-600 text-white font-semibold' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1 pt-2 border-t border-zinc-800/80">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block px-2">
                  Narzędzia Reżysera
                </span>
                {onOpenAiAssistant && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenAiAssistant();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-900"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>Asystent Sekwencji</span>
                  </button>
                )}
                {onOpenDirector && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenDirector();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-900"
                  >
                    <Wand2 className="w-4 h-4 text-indigo-400" />
                    <span>Reżyseria & Montaż</span>
                  </button>
                )}
                {onOpenVoiceRecorder && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenVoiceRecorder();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-900"
                  >
                    <Mic className="w-4 h-4 text-emerald-400" />
                    <span>Dyktafon & Lektor</span>
                  </button>
                )}
                {onOpenTemplateGallery && (
                  <button
                    onClick={() => {
                      setIsMobileDrawerOpen(false);
                      onOpenTemplateGallery();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-900"
                  >
                    <Bookmark className="w-4 h-4 text-cyan-400" />
                    <span>Szablony Wideo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <PWAInstallButton isCompact={false} />
              <ModernAuthStatus isCollapsed={false} />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Collapsible Sidebar (Hidden on Mobile) */}
      <aside 
        className={`hidden md:flex relative z-30 shrink-0 h-screen sticky top-0 flex-col justify-between bg-[#0e0e12]/95 border-r border-zinc-800/80 backdrop-blur-2xl transition-all duration-300 ${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Sidebar Header: Logo & Branding */}
        <div className="p-3 border-b border-zinc-800/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
                <Scissors className="w-4 h-4 stroke-[2.5]" />
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold tracking-tight text-white font-heading truncate">KAPI-STUDIO</span>
                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">PRO</span>
                  </div>
                  <span className="text-[10.5px] text-zinc-400 block truncate">Studio Postprodukcji 4K</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title={isSidebarCollapsed ? 'Rozwiń pasek boczny (Ctrl+B)' : 'Zwiń pasek boczny (Ctrl+B)'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
          {/* Main workspace section */}
          <div>
            {!isSidebarCollapsed && (
              <span className="px-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                Obszar Roboczy
              </span>
            )}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-3 px-3 py-2.5'} rounded-xl transition-all cursor-pointer font-medium text-xs ${
                      isActive 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-semibold' 
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                    }`}
                    title={isSidebarCollapsed ? `${item.label} (${item.desc})` : undefined}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                    {!isSidebarCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Director Tools */}
          <div>
            {!isSidebarCollapsed && (
              <span className="px-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                Narzędzia Reżysera
              </span>
            )}
            <div className="space-y-1">
              {onOpenAiAssistant && (
                <button
                  onClick={onOpenAiAssistant}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-3 px-3 py-2'} rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer`}
                  title="Asystent Sekwencji i Cięć"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">Asystent Sekwencji</span>}
                </button>
              )}

              {onOpenDirector && (
                <button
                  onClick={onOpenDirector}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-3 px-3 py-2'} rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer`}
                  title="Centrum Reżyserii & Smart Montage"
                >
                  <Wand2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">Reżyseria & Montaż</span>}
                </button>
              )}

              {onOpenVoiceRecorder && (
                <button
                  onClick={onOpenVoiceRecorder}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-3 px-3 py-2'} rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer`}
                  title="Nagraj Lektora lub Podkład Audio"
                >
                  <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">Dyktafon & Lektor</span>}
                </button>
              )}

              {onOpenTemplateGallery && (
                <button
                  onClick={onOpenTemplateGallery}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-3 px-3 py-2'} rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer`}
                  title="Wybierz Gotowy Szablon Montażowy"
                >
                  <Bookmark className="w-4 h-4 text-cyan-400 shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">Szablony Wideo</span>}
                </button>
              )}
            </div>
          </div>

          {/* Cloud & Integrations */}
          <div>
            {!isSidebarCollapsed && (
              <span className="px-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                Integracje
              </span>
            )}
            <div className="space-y-1">
              <button
                onClick={() => onTabChange('media')}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-2.5 px-3 py-2'} rounded-xl text-xs transition-colors cursor-pointer ${
                  hasDriveAccess 
                    ? 'text-emerald-400 hover:bg-emerald-500/10' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
                title="Google Drive: import i eksport wideo"
              >
                <GoogleDriveIcon className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && (
                  <div className="flex items-center justify-between flex-1 min-w-0">
                    <span className="truncate">Dysk Google</span>
                    <span className={`w-2 h-2 rounded-full ${hasDriveAccess ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-zinc-600'}`} />
                  </div>
                )}
              </button>

              <button
                onClick={() => onTabChange('settings')}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-start gap-2.5 px-3 py-2'} rounded-xl text-xs transition-colors cursor-pointer text-zinc-400 hover:text-white hover:bg-zinc-800/60`}
                title="Status bazy Firestore"
              >
                <Cloud className={`w-4 h-4 shrink-0 ${isDbConnected ? 'text-indigo-400' : 'text-zinc-600'}`} />
                {!isSidebarCollapsed && (
                  <div className="flex items-center justify-between flex-1 min-w-0">
                    <span className="truncate">Chmura Firestore</span>
                    <span className={`w-2 h-2 rounded-full ${isDbConnected ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]' : 'bg-zinc-600'}`} />
                  </div>
                )}
              </button>
            </div>
          </div>
          {/* Pro WebGL2 GPU Engine Status Badge */}
          {!isSidebarCollapsed ? (
            <div className="p-3 rounded-2xl bg-[#18181b] border border-[#27272a] shadow-xl backdrop-blur-xl flex items-center gap-3 relative overflow-hidden group">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40 flex items-center justify-center text-[#00e5cc] shadow-inner">
                  <Cpu className="w-5 h-5 text-[#00e5cc]" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow">
                  <Zap className="w-2 h-2 text-black fill-black" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-zinc-100 truncate">Pro Video Engine</span>
                  <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 block truncate font-mono mt-0.5">WebGL2 • GPU 4K Ready</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title="Pro Video Engine • GPU 4K Accelerated">
              <div className="w-8 h-8 rounded-xl bg-[#18181b] border border-[#27272a] flex items-center justify-center text-[#00e5cc]">
                <Cpu className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer: User & PWA */}
        <div className="p-3 border-t border-zinc-800/60 space-y-2">
          <PWAInstallButton isCompact={isSidebarCollapsed} />
          <ModernAuthStatus isCollapsed={isSidebarCollapsed} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Top Header Bar */}
        <header className="h-12 w-full border-b border-[#27272a] bg-[#18181b] px-3 sm:px-4 flex items-center justify-between shrink-0 z-40 gap-4 select-none">
          {/* Left: Kapi-Studio Logo + Menu dropdown + Auto-Save Status */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 cursor-pointer"
              title="Otwórz menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Kapi-Studio Logo & Menu */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-black font-extrabold shadow-sm">
                <Scissors className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xs tracking-tight text-white hidden sm:inline font-sans">Kapi-Studio</span>
              <button 
                onClick={() => setIsMobileDrawerOpen(prev => !prev)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#27272a] hover:bg-[#323238] text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
              >
                <span>Menu</span>
                <span className="text-[10px] text-zinc-400">▾</span>
              </button>
            </div>

            {/* Auto-Saved Status */}
            <div 
              className="hidden lg:flex items-center gap-2 text-xs text-zinc-400 font-sans"
              title={autoSaveStatus === 'saved' ? 'Wszystkie zmiany zapisane w chmurze' : 'Zapisywanie...'}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,229,204,0.6)]" />
              <span className="text-zinc-400 font-medium text-xs">
                {autoSaveStatus === 'saving' ? 'Zapisywanie...' : 'Zapisano w chmurze'}
              </span>
            </div>
          </div>

          {/* Center: Project Title (Editable) */}
          <div className="flex items-center justify-center min-w-0 flex-1 max-w-xs sm:max-w-md">
            {isEditingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleFinishNameEdit}
                onKeyDown={(e) => e.key === 'Enter' && handleFinishNameEdit()}
                autoFocus
                className="bg-[#27272a] border border-cyan-500 rounded-lg px-3 py-1 text-xs text-white focus:outline-none w-52 text-center font-semibold font-sans"
              />
            ) : (
              <div 
                onClick={() => setIsEditingName(true)}
                className="flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-[#27272a] cursor-pointer transition-colors max-w-full group"
                title="Kliknij, aby zmienić nazwę projektu"
              >
                <h1 className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white transition-colors font-sans">
                  {projectName || 'Nowy Projekt'}
                </h1>
                <Edit2 className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
              </div>
            )}
          </div>

          {/* Right: PWA Install, Shortcut [Cmd+K], Undo/Redo, Export Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Direct PWA Install / Download App Button */}
            <PWAInstallButton variant="header" />

            {/* Shortcut Trigger (Cmd+K) */}
            <button
              onClick={onOpenCommandPalette}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#27272a] hover:bg-[#323238] border border-[#3f3f46]/50 rounded-lg text-zinc-300 hover:text-white text-xs font-semibold font-sans transition-colors cursor-pointer"
              title="Skróty i paleta poleceń (Cmd+K / Ctrl+K)"
            >
              <Keyboard className="w-5 h-5 text-cyan-400" />
              <span>Polecenia (⌘K)</span>
            </button>

            {/* Undo / Redo */}
            <div className="hidden xs:flex items-center bg-[#27272a] border border-[#3f3f46]/40 rounded-lg p-1 gap-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-[#323238] disabled:opacity-30 cursor-pointer transition-colors"
                title="Cofnij (Ctrl+Z)"
              >
                <Undo2 className="w-5 h-5" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-[#323238] disabled:opacity-30 cursor-pointer transition-colors"
                title="Ponów (Ctrl+Y)"
              >
                <Redo2 className="w-5 h-5" />
              </button>
            </div>

            {/* Studio Turquoise Export Button */}
            <button
              onClick={() => onTabChange('export')}
              className="bg-[#00e5cc] hover:bg-[#14f3db] text-black font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-md shadow-cyan-950/40 active:scale-95 transition-all flex items-center gap-2 cursor-pointer font-sans"
              title="Wyrenderuj i pobierz plik MP4 (GPU 4K WebCodecs)"
            >
              <Download className="w-5 h-5 text-black stroke-[2.5]" />
              <span className="font-bold">Eksport</span>
            </button>
          </div>
        </header>

        {/* Offline notification banner */}
        {!isOnline && (
          <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-1.5 flex items-center justify-between text-xs text-amber-200 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2">
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Jesteś offline. Zmiany są bezpiecznie zapisywane w pamięci lokalnej przeglądarki.</span>
            </div>
            <span className="font-mono text-[10px] opacity-80">IndexedDB Cache ON</span>
          </div>
        )}

        {/* Recovery available banner */}
        {recoveryAvailable && onRestoreRecovery && (
          <div className="bg-indigo-950/40 border-b border-indigo-800/40 px-4 py-1.5 flex items-center justify-between text-xs text-indigo-200 backdrop-blur-md shrink-0 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Wykryto niezapisaną wersję projektu. Czy chcesz ją przywrócić?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onRestoreRecovery}
                className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors cursor-pointer"
              >
                Przywróć
              </button>
              {onDismissRecovery && (
                <button
                  onClick={onDismissRecovery}
                  className="px-2 py-0.5 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
                >
                  Odrzuć
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Work Area without any page-level scrolling */}
        <main className="flex-1 w-full h-full overflow-hidden p-0 relative flex flex-col pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Fixed for Smartphones & Tablets with 48px+ touch targets) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-zinc-800/80 backdrop-blur-2xl px-2 py-1 flex items-center justify-around pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.8)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all cursor-pointer min-w-[56px] min-h-[48px] touch-manipulation active:scale-95 ${
                isActive
                  ? 'text-indigo-400 font-bold scale-105'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-indigo-600/25 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.3)]' : ''}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-tight font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && onResetProject && (
        <ConfirmModal
          isOpen={isResetConfirmOpen}
          title="Reset Projektu"
          message="Czy na pewno chcesz zresetować bieżący projekt do stanu początkowego? Wszystkie niescalone zmiany zostaną usunięte."
          confirmText="Zresetuj Projekt"
          confirmVariant="danger"
          onConfirm={() => {
            setIsResetConfirmOpen(false);
            onResetProject();
          }}
          onCancel={() => setIsResetConfirmOpen(false)}
        />
      )}
    </div>
  );
}
