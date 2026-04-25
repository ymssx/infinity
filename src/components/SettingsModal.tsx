"use client";

import { useState, useEffect } from "react";
import { getConfig, saveConfig, AppConfig, MODEL_PRESETS, getPreset } from "@/lib/config";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<AppConfig>(getConfig());

  useEffect(() => {
    if (open) setConfig(getConfig());
  }, [open]);

  const isCustom = config.provider === "custom";
  const currentPreset = !isCustom ? getPreset(config.provider) : undefined;

  const handleSelectPreset = (presetId: string) => {
    const preset = getPreset(presetId);
    if (preset) {
      setConfig({
        ...config,
        provider: presetId,
        openaiBaseUrl: preset.baseUrl,
        openaiModel: preset.defaultModel,
      });
    }
  };

  const handleSelectCustom = () => {
    setConfig({
      ...config,
      provider: "custom",
    });
  };

  const handleSave = () => {
    saveConfig(config);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Settings</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2.5">Model Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`
                    flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer
                    ${config.provider === preset.id
                      ? "border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-100"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }
                  `}
                >
                  <span className="text-lg leading-none">{preset.icon}</span>
                  <span className={`text-sm font-medium ${config.provider === preset.id ? "text-indigo-700" : "text-gray-700"}`}>
                    {preset.name}
                  </span>
                </button>
              ))}

              {/* Custom option */}
              <button
                onClick={handleSelectCustom}
                className={`
                  flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer
                  ${isCustom
                    ? "border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-100"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }
                `}
              >
                <span className="text-lg leading-none">⚙️</span>
                <span className={`text-sm font-medium ${isCustom ? "text-indigo-700" : "text-gray-700"}`}>
                  Custom
                </span>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              API Key <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={config.openaiApiKey}
              onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value })}
              placeholder={currentPreset?.keyPlaceholder || "Enter your API Key..."}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
            {currentPreset ? (
              <p className="mt-1.5 text-xs text-gray-400">
                <a
                  href={currentPreset.keyGuideUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-600 transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6H18m0 0v4.5m0-4.5L10.5 13.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {currentPreset.keyGuideText}
                </a>
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Your key is stored locally in the browser only. Never sent to any third party.</p>
            )}
          </div>

          {/* Base URL — shown for custom, or collapsed for presets */}
          {isCustom ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">API Base URL</label>
              <input
                type="text"
                value={config.openaiBaseUrl}
                onChange={(e) => setConfig({ ...config, openaiBaseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              <p className="mt-1 text-xs text-gray-400">Any OpenAI-compatible endpoint URL.</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-xs text-gray-400">
              <span className="font-mono text-gray-500">{config.openaiBaseUrl}</span>
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
            {currentPreset ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {currentPreset.models.map((model) => (
                    <button
                      key={model}
                      onClick={() => setConfig({ ...config, openaiModel: model })}
                      className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                        ${config.openaiModel === model
                          ? "bg-indigo-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }
                      `}
                    >
                      {model}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={config.openaiModel}
                  onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
                  placeholder={currentPreset.defaultModel}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
                <p className="text-xs text-gray-400">Pick from above or type any model name.</p>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={config.openaiModel}
                  onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
                  placeholder="Model name"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-300 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!config.openaiApiKey.trim() || (!isCustom ? false : !config.openaiBaseUrl.trim())}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
