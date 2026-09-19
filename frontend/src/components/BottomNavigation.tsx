import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Activity, Users, Settings, LucideIcon } from 'lucide-react';

export type NavigationTab = 'protect' | 'activity' | 'family' | 'settings';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: LucideIcon;
}

interface BottomNavigationProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  className?: string;
}

const navItems: NavItem[] = [
  { id: 'protect', label: 'Protect', icon: Shield },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'family', label: 'Family', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange,
  className = '',
}) => {
  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(5, 7, 11, 0) 0%, rgba(5, 7, 11, 0.8) 20%, rgba(5, 7, 11, 0.95) 100%)',
      }}
    >
      {/* Glassmorphic container */}
      <div className="max-w-2xl mx-auto px-4 pb-safe">
        <div
          className="relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl"
          style={{
            boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.3), 0 0 40px rgba(0, 229, 255, 0.1)',
          }}
        >
          {/* Active indicator background */}
          <motion.div
            layoutId="activeTab"
            className="absolute top-0 left-0 h-full bg-primary/10 rounded-2xl border border-primary/30"
            style={{
              width: `${100 / navItems.length}%`,
              boxShadow: '0 0 30px rgba(0, 229, 255, 0.2)',
            }}
            initial={false}
            animate={{
              x: `${navItems.findIndex((item) => item.id === activeTab) * 100}%`,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
          />

          {/* Navigation items */}
          <div className="relative flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className="relative flex-1 flex flex-col items-center justify-center py-4 px-2 transition-colors"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {/* Icon */}
                  <motion.div
                    animate={{
                      scale: isActive ? 1.1 : 1,
                      y: isActive ? -2 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="relative"
                  >
                    <Icon
                      className={`w-6 h-6 transition-colors ${
                        isActive ? 'text-primary' : 'text-white/50'
                      }`}
                      strokeWidth={isActive ? 2.5 : 2}
                    />

                    {/* Glow effect for active */}
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute inset-0 blur-md"
                      >
                        <Icon className="w-6 h-6 text-primary" strokeWidth={2.5} />
                      </motion.div>
                    )}
                  </motion.div>

                  {/* Label */}
                  <motion.span
                    animate={{
                      opacity: isActive ? 1 : 0.5,
                      scale: isActive ? 1 : 0.95,
                    }}
                    transition={{ duration: 0.2 }}
                    className={`mt-1.5 text-xs font-semibold transition-colors ${
                      isActive ? 'text-primary' : 'text-white/60'
                    }`}
                  >
                    {item.label}
                  </motion.span>

                  {/* Active dot indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeDot"
                      className="absolute -top-1 w-1 h-1 rounded-full bg-primary"
                      style={{
                        boxShadow: '0 0 8px rgba(0, 229, 255, 0.8)',
                      }}
                      initial={false}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Safe area spacing for mobile devices */}
      <div className="h-safe" />
    </nav>
  );
};

// Compact variant for tighter spaces
export const BottomNavigationCompact: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange,
  className = '',
}) => {
  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 ${className}`}
      style={{
        background: 'rgba(5, 7, 11, 0.95)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="border-t border-white/10">
        <div className="max-w-2xl mx-auto flex items-center justify-around px-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="relative flex items-center gap-2 py-3 px-4 transition-colors"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'text-primary' : 'text-white/50'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {isActive && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-sm font-semibold text-primary"
                  >
                    {item.label}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
