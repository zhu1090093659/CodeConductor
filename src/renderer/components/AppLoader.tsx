import React from 'react';
import AsciiSpinner from './AsciiSpinner';

const AppLoader: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <AsciiSpinner size={32} style='petal' glow glowColor='var(--primary)' />
    </div>
  );
};

export default AppLoader;
