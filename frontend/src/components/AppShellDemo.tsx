import React, { useState } from 'react';
import { BottomNavigation, NavigationTab } from './BottomNavigation';
import { ProtectDashboard } from './ProtectDashboard';
import { ActivityTab } from './ActivityTab';
import { FamilyTab } from './FamilyTab';
import { PageBackground } from './ui';

/**
 * AppShellDemo - Complete app experience with navigation
 * Demonstrates the full VoiceShield interface with all tabs
 */
export const AppShellDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('protect');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'protect':
        return (
          <ProtectDashboard
            ownerPhone="+1 (555) 123-4567"
            status="active"
            onNavigate={(tab) => {
              // Map dashboard navigation to app tabs
              if (tab === 'activity') setActiveTab('activity');
              if (tab === 'family') setActiveTab('family');
            }}
          />
        );

      case 'activity':
        return (
          <ActivityTab
            onCallSelect={(call) => {
              console.log('Selected call:', call);
              // Could navigate to call detail view
            }}
          />
        );

      case 'family':
        return (
          <FamilyTab
            onAddMember={() => {
              console.log('Add family member');
              // Could open add member modal
            }}
            onViewDetails={(member) => {
              console.log('View member details:', member);
              // Could navigate to member detail view
            }}
          />
        );

      case 'settings':
        return (
          <div className="min-h-screen bg-vs-background p-6 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-6xl mb-4">⚙️</div>
              <h1 className="text-3xl font-bold text-white">Settings</h1>
              <p className="text-white/60 max-w-md">
                Settings panel coming soon. Configure notifications, privacy settings,
                blocklists, and more.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <PageBackground grid noise glow>
      {/* Tab content */}
      <div className="pb-24">
        {renderTabContent()}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </PageBackground>
  );
};
