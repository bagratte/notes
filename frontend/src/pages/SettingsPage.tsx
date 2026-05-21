import { useState, useCallback } from "react";
import { DrawingCanvas } from "@/components/Canvas";
import type { StrokeData } from "@/components/Canvas";
import { useDrawingSettings } from "@/context/DrawingSettings";
import { useTheme, type ThemeChoice } from "@/context/Theme";
import css from "./SettingsPage.module.css";

export default function SettingsPage() {
  const { settings, update, reset } = useDrawingSettings();
  const { theme, setTheme } = useTheme();
  const [strokes, setStrokes] = useState<StrokeData[]>([]);
  const addStroke = useCallback((s: StrokeData) => setStrokes((prev) => [...prev, s]), []);

  return (
    <div className={css.page}>
      <div className={css.header}>
        <span className={css.title}>Settings</span>
      </div>

      <div className={css.body}>
        <div className={css.section}>
          <div className={css.sectionTitle}>Appearance</div>
          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Theme</div>
              <div className={css.rowHint}>System follows your OS dark/light setting</div>
            </div>
            <div className={css.themeGroup}>
              {(["system", "light", "dark"] as ThemeChoice[]).map((t) => (
                <button
                  key={t}
                  className={`${css.themeBtn}${theme === t ? " " + css.themeBtnActive : ""}`}
                  onClick={() => setTheme(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={css.section}>
          <div className={css.sectionTitle}>Drawing</div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Streamline</div>
              <div className={css.rowHint}>0 = track pen exactly · 0.5 = max lag</div>
            </div>
            <div className={css.sliderGroup}>
              <input
                type="range"
                className={css.slider}
                min="0"
                max="0.5"
                step="0.05"
                value={settings.streamline}
                onChange={(e) => update({ streamline: Number(e.target.value) })}
              />
              <span className={css.sliderValue}>{settings.streamline.toFixed(2)}</span>
            </div>
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Thinning</div>
              <div className={css.rowHint}>Pressure-based width variation</div>
            </div>
            <div className={css.sliderGroup}>
              <input
                type="range"
                className={css.slider}
                min="0"
                max="1"
                step="0.05"
                value={settings.thinning}
                onChange={(e) => update({ thinning: Number(e.target.value) })}
              />
              <span className={css.sliderValue}>{settings.thinning.toFixed(2)}</span>
            </div>
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Pressure multiplier</div>
              <div className={css.rowHint}>Scale raw pressure before the curve · &gt;1 amplifies, &lt;1 reduces</div>
            </div>
            <div className={css.sliderGroup}>
              <input
                type="range"
                className={css.slider}
                min="0.25"
                max="3"
                step="0.05"
                value={settings.pressureMultiplier}
                onChange={(e) => update({ pressureMultiplier: Number(e.target.value) })}
              />
              <span className={css.sliderValue}>{settings.pressureMultiplier.toFixed(2)}</span>
            </div>
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Pressure curve (gamma)</div>
              <div className={css.rowHint}>&lt;1 = more response at light pressure · &gt;1 = need harder press for thick lines</div>
            </div>
            <div className={css.sliderGroup}>
              <input
                type="range"
                className={css.slider}
                min="0.25"
                max="3"
                step="0.05"
                value={settings.pressureGamma}
                onChange={(e) => update({ pressureGamma: Number(e.target.value) })}
              />
              <span className={css.sliderValue}>{settings.pressureGamma.toFixed(2)}</span>
            </div>
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Smoothing</div>
              <div className={css.rowHint}>Stroke outline smoothness</div>
            </div>
            <div className={css.sliderGroup}>
              <input
                type="range"
                className={css.slider}
                min="0"
                max="1"
                step="0.05"
                value={settings.smoothing}
                onChange={(e) => update({ smoothing: Number(e.target.value) })}
              />
              <span className={css.sliderValue}>{settings.smoothing.toFixed(2)}</span>
            </div>
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Palm rejection</div>
              <div className={css.rowHint}>Block touch contacts larger than the threshold below</div>
            </div>
            <button
              className={`${css.toggle}${settings.palmRejection ? " " + css.toggleOn : ""}`}
              onClick={() => update({ palmRejection: !settings.palmRejection })}
              title={settings.palmRejection ? "On" : "Off"}
            />
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Palm threshold</div>
              <div className={css.rowHint}>Max touch contact size (px) before it's treated as a palm</div>
            </div>
            <div className={css.sliderGroup}>
              <input
                type="range"
                className={css.slider}
                min="20"
                max="200"
                step="5"
                value={settings.palmThreshold}
                disabled={!settings.palmRejection}
                onChange={(e) => update({ palmThreshold: Number(e.target.value) })}
              />
              <span className={css.sliderValue}>{settings.palmThreshold}</span>
            </div>
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Simulate pressure</div>
              <div className={css.rowHint}>Infer pressure from velocity when unavailable</div>
            </div>
            <button
              className={`${css.toggle}${settings.simulatePressure ? " " + css.toggleOn : ""}`}
              onClick={() => update({ simulatePressure: !settings.simulatePressure })}
              title={settings.simulatePressure ? "On" : "Off"}
            />
          </div>

          <div className={css.row}>
            <div>
              <div className={css.rowLabel}>Predicted events</div>
              <div className={css.rowHint}>Draw ahead of pen tip using browser-predicted positions</div>
            </div>
            <button
              className={`${css.toggle}${settings.predictive ? " " + css.toggleOn : ""}`}
              onClick={() => update({ predictive: !settings.predictive })}
              title={settings.predictive ? "On" : "Off"}
            />
          </div>
        </div>

        <div className={css.section}>
          <div className={css.scratchpadHeader}>
            <span className={css.sectionTitle} style={{ borderBottom: "none", padding: 0 }}>Scratchpad</span>
            <button className={css.clearBtn} onClick={() => setStrokes([])}>Clear</button>
          </div>
          <DrawingCanvas
            strokes={strokes}
            onStrokeComplete={addStroke}
            color="#2255cc"
            penWidth={3}
            height={220}
            className={css.scratchpad}
          />
        </div>

        <button className={css.resetBtn} onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
