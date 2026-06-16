'use client';

import { useEffect } from 'react';
import {
  TelemetryDisplayConfig,
  TelemetryMode,
  TELEMETRY_MODE_LABELS,
} from '@/types/video';
import { IconX } from '@tabler/icons-react';

interface TelemetryOptionsPopoverProps {
  displayConfig: TelemetryDisplayConfig;
  telemetryMode: TelemetryMode;
  onDisplayConfigChange: (config: TelemetryDisplayConfig) => void;
  onTelemetryModeChange: (mode: TelemetryMode) => void;
  onClose: () => void;
  hasTelemetrySlot?: boolean;
}

const MODES: TelemetryMode[] = ['overlay-top', 'overlay-bottom', 'split', 'below'];

const TOGGLE_GROUPS: Array<{
  title: string;
  items: Array<{ key: keyof TelemetryDisplayConfig; label: string }>;
}> = [
  {
    title: 'HUD',
    items: [
      { key: 'showHud', label: 'HUD card' },
      { key: 'showSpeed', label: 'Speed' },
      { key: 'showGear', label: 'Gear' },
      { key: 'showBrake', label: 'Brake' },
      { key: 'showBlinkers', label: 'Blinkers' },
      { key: 'showSteering', label: 'Steering' },
      { key: 'showAccelerator', label: 'Accelerator' },
      { key: 'showAutopilot', label: 'Autopilot label' },
    ],
  },
  {
    title: 'Graphs',
    items: [
      { key: 'showGraphLong', label: 'Longitudinal G' },
      { key: 'showGraphLat', label: 'Lateral G' },
      { key: 'showGraphSpeed', label: 'Speed' },
    ],
  },
];

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 cursor-pointer group">
      <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-colors ${
          checked ? 'bg-green-600' : 'bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </label>
  );
}

export function TelemetryOptionsPopover({
  displayConfig,
  telemetryMode,
  onDisplayConfigChange,
  onTelemetryModeChange,
  onClose,
  hasTelemetrySlot = false,
}: TelemetryOptionsPopoverProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const setField = (key: keyof TelemetryDisplayConfig, value: boolean) => {
    onDisplayConfigChange({ ...displayConfig, [key]: value });
  };

  return (
    <div className="absolute bottom-full right-0 mb-2 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-200">Telemetry</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <IconX size={14} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Placement</span>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {MODES.map((mode) => {
            const disabled = mode === 'split' && hasTelemetrySlot;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => onTelemetryModeChange(mode)}
                className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  telemetryMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {TELEMETRY_MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
        {hasTelemetrySlot && (
          <p className="text-[10px] text-purple-400 mt-2">
            Layout includes a telemetry slot — dashboard renders in-frame.
          </p>
        )}
      </div>

      {TOGGLE_GROUPS.map((group) => (
        <div key={group.title} className="px-3 py-2 border-b border-gray-700 last:border-b-0">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            {group.title}
          </span>
          <div className="mt-1">
            {group.items.map((item) => (
              <ToggleRow
                key={item.key}
                label={item.label}
                checked={displayConfig[item.key]}
                onChange={(v) => setField(item.key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}