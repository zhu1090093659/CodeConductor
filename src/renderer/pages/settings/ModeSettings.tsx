/**
 * @license
 * Copyright 2025 CodeConductor (CodeConductor.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import CliProviderSettings from './CliProviderSettings';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ModeSettings: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-1100px'>
      <CliProviderSettings embedded />
    </SettingsPageWrapper>
  );
};

export default ModeSettings;
