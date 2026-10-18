/**
 * Browser half of dsh-tool-compact-context: the Plugins-page configuration
 * form for one row. The file is served as a classic script inside
 * `window.__ModuleLoader__.load`, so everything lives inside the factory and no
 * ESM syntax is emitted.
 */

/** One switch rendered by the form. */
interface SwitchSpec {
  readonly key: string;
  readonly fallback: boolean;
  readonly zh: string;
  readonly en: string;
  readonly zhHint: string;
  readonly enHint: string;
}

(window as any).__ModuleLoader__.load({
  id: 'dsh-tool-compact-context',
  factory(require: (name: string) => unknown) {
    /** The row id declared by this bundle's patch; the config form is keyed by it. */
    const ROW_ID = 'dsh-tool-compact-context';
    /** The bundle id the shell registers; must match the npm package name. */
    const BUNDLE_ID = 'dsh-tool-compact-context';
    const React: any = require('react');
    const h = React.createElement;
    const zh = String(navigator.language || '').toLowerCase().startsWith('zh');
    const t = (zhText: string, enText: string): string => (zh ? zhText : enText);

    const SWITCHES: readonly SwitchSpec[] = [
      {
        key: 'compactTool',
        fallback: true,
        zh: '压缩工具',
        en: 'Compaction tool',
        zhHint: '允许模型调用 compact_context，在需要时压缩较早历史。',
        enHint: 'Let the model call compact_context to condense older history on demand.',
      },
      {
        key: 'statusTool',
        fallback: false,
        zh: '状态查询工具（按需开启）',
        en: 'Status tool (opt-in)',
        zhHint: '允许模型查询上下文占用和压缩阈值。默认关闭：schema 和结果都可能影响行为与历史。',
        enHint: 'Let the model query occupancy and the compaction threshold. Off by default: its schema and results can influence behavior and history.',
      },
      {
        key: 'guidance',
        fallback: false,
        zh: '上下文策略段',
        en: 'Context policy section',
        zhHint: '在系统提示词中加入“需要空间就压缩”的策略。默认关闭；也可以把策略写在 AGENTS.md。',
        enHint: 'Add a "compact instead of stopping" section. Off by default; you can also write the strategy in AGENTS.md.',
      },
      {
        key: 'pressureContext',
        fallback: false,
        zh: '自动水位注入（实验）',
        en: 'Automatic pressure line (experimental)',
        zhHint: '按分桶追加“约 xx%”的 runtime context。默认关闭：它会在模型没询问时增加内容和历史。',
        enHint: 'Append a quantized "~xx%" runtime-context line. Off by default: it adds unrequested content and history.',
      },
    ];

    const styles = {
      root: { display: 'grid', gap: 12, color: 'var(--dsw-alias-label-primary)', fontSize: 13, paddingBottom: 4 },
      heading: { margin: 0, fontSize: 14, fontWeight: 600 },
      row: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2, alignItems: 'start', cursor: 'pointer' },
      label: { fontWeight: 500, lineHeight: '20px' },
      hint: { gridColumn: '2', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' },
      note: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px', margin: 0 },
      hintBlock: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' },
      textarea: {
        width: '100%', minHeight: 120, boxSizing: 'border-box', resize: 'vertical',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: '18px',
        color: 'var(--dsw-alias-label-primary, #111)', background: 'var(--dsw-alias-bg-primary, #fff)',
        border: '1px solid var(--dsw-alias-border-secondary, #ccc)', borderRadius: 6, padding: 8,
      },
      actions: { display: 'flex', gap: 10, alignItems: 'center' },
      button: {
        padding: '5px 12px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-secondary, #ccc)',
        background: 'var(--dsw-alias-bg-primary, #fff)', color: 'var(--dsw-alias-label-primary, #111)',
        cursor: 'pointer', fontSize: 12,
      },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, margin: 0 },
      sectionHeading: { margin: '4px 0 0', fontSize: 13, fontWeight: 600 },
      field: { display: 'grid', gap: 4 },
      number: {
        width: 140, boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, fontSize: 12,
        color: 'var(--dsw-alias-label-primary, #111)', background: 'var(--dsw-alias-bg-primary, #fff)',
        border: '1px solid var(--dsw-alias-border-secondary, #ccc)',
      },
      fieldHint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' },
    };

    function effective(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
      return value[key] === undefined ? fallback : Boolean(value[key]);
    }

    function numberValue(value: Record<string, unknown>, key: string, fallback: number): number {
      const raw = value[key];
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
    }

    /** Render milliseconds as seconds without trailing zero noise. */
    function secondsText(ms: number): string {
      if (!Number.isFinite(ms)) return '0';
      return String(Math.round((ms / 1000) * 1000) / 1000);
    }

    function formatModelTimeouts(value: unknown): string {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return '';
      return Object.entries(value as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, ms]) => `${key} = ${secondsText(ms)}`)
        .join('\n');
    }

    function ConfigView(props: any): unknown {
      const form = props.configForm;
      const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot());
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');
      const [policyDraft, setPolicyDraft] = React.useState(() => {
        const initial = (snapshot?.value as Record<string, unknown> | undefined)?.guidanceText;
        return typeof initial === 'string' ? initial : '';
      });
      const [policyDirty, setPolicyDirty] = React.useState(false);
      const [timeoutDraft, setTimeoutDraft] = React.useState(() => {
        const initial = (snapshot?.value ?? {}) as Record<string, unknown>;
        return {
          retryAttempts: String(numberValue(initial, 'retryAttempts', 2)),
          retryDelay: secondsText(numberValue(initial, 'retryDelayMs', 1000)),
          ptcTimeout: secondsText(numberValue(initial, 'ptcTimeoutMs', 0)),
          ptcModels: formatModelTimeouts(initial.ptcModelTimeouts),
        };
      });
      const [timeoutsDirty, setTimeoutsDirty] = React.useState(false);
      React.useEffect(() => {
        const off = form.subscribe(() => setSnapshot(form.getSnapshot()));
        return () => {
          if (typeof off === 'function') off();
        };
      }, [form]);
      React.useEffect(() => {
        if (policyDirty) return;
        const next = (snapshot?.value as Record<string, unknown> | undefined)?.guidanceText;
        setPolicyDraft(typeof next === 'string' ? next : '');
      }, [snapshot, policyDirty]);
      React.useEffect(() => {
        if (timeoutsDirty) return;
        const next = (snapshot?.value ?? {}) as Record<string, unknown>;
        setTimeoutDraft({
          retryAttempts: String(numberValue(next, 'retryAttempts', 2)),
          retryDelay: secondsText(numberValue(next, 'retryDelayMs', 1000)),
          ptcTimeout: secondsText(numberValue(next, 'ptcTimeoutMs', 0)),
          ptcModels: formatModelTimeouts(next.ptcModelTimeouts),
        });
      }, [snapshot, timeoutsDirty]);

      if (props.view === 'summary') {
        return h('span', { style: styles.note }, t('上下文压缩与状态工具', 'Context compaction and status tools'));
      }

      const value = (snapshot?.value ?? {}) as Record<string, unknown>;
      const ready = snapshot?.status === 'ready' && snapshot?.writable === true;

      const toggle = async (key: string, fallback: boolean): Promise<void> => {
        if (!ready || busy !== '') return;
        setBusy(key);
        setError('');
        try {
          const ok = await form.mutate(
            [{ op: 'set', path: [key], value: !effective(value, key, fallback) }],
            snapshot.revision,
          );
          if (!ok) {
            setError(t('保存未被接受；请刷新后重试。', 'The save was not accepted; refresh and retry.'));
          }
        } catch {
          setError(t('无法保存配置，请检查连接后重试。', 'Could not save the configuration; check the connection and retry.'));
        } finally {
          setBusy('');
        }
      };

      const savedPolicy = typeof value.guidanceText === 'string' ? value.guidanceText : '';
      const policyChanged = policyDraft !== savedPolicy;

      const savePolicy = async (): Promise<void> => {
        if (!ready || busy !== '' || !policyChanged) return;
        if (policyDraft.length > 8000) {
          setError(t('策略文本最多 8000 字符。', 'Policy text is limited to 8000 characters.'));
          return;
        }
        setBusy('guidanceText');
        setError('');
        try {
          const ok = await form.mutate(
            [{ op: 'set', path: ['guidanceText'], value: policyDraft }],
            snapshot.revision,
          );
          if (ok) {
            setSnapshot(form.getSnapshot());
            setPolicyDirty(false);
          } else {
            setError(t('保存未被接受；请刷新后重试。', 'The save was not accepted; refresh and retry.'));
          }
        } catch {
          setError(t('无法保存配置，请检查连接后重试。', 'Could not save the configuration; check the connection and retry.'));
        } finally {
          setBusy('');
        }
      };

      const saveTimeouts = async (): Promise<void> => {
        if (!ready || busy !== '' || !timeoutsDirty) return;
        const attempts = Number(timeoutDraft.retryAttempts);
        if (!Number.isInteger(attempts) || attempts < 0 || attempts > 5) {
          setError(t('重试次数必须是 0 到 5 的整数。', 'Retry attempts must be an integer from 0 to 5.'));
          return;
        }
        const retrySeconds = Number(timeoutDraft.retryDelay);
        if (!Number.isFinite(retrySeconds) || retrySeconds < 0 || retrySeconds > 60) {
          setError(t('重试延迟必须是 0 到 60 秒。', 'Retry delay must be between 0 and 60 seconds.'));
          return;
        }
        const ptcSeconds = Number(timeoutDraft.ptcTimeout);
        if (!Number.isFinite(ptcSeconds) || ptcSeconds < 0) {
          setError(t('PTC 预算必须是非负秒数（0 = 部署默认）。', 'The PTC budget must be a non-negative number of seconds (0 = deployment default).'));
          return;
        }
        const models: Record<string, number> = {};
        const lines = timeoutDraft.ptcModels.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index].trim();
          if (line === '' || line.startsWith('#')) continue;
          const equals = line.indexOf('=');
          if (equals <= 0) {
            setError(t(`第 ${index + 1} 行格式应为 provider/model = 秒。`, `Line ${index + 1} must be provider/model = seconds.`));
            return;
          }
          const key = line.slice(0, equals).trim();
          const value = Number(line.slice(equals + 1).trim());
          if (!key.includes('/') || !Number.isFinite(value) || value <= 0) {
            setError(t(`第 ${index + 1} 行需要 provider/model 和正秒数。`, `Line ${index + 1} needs provider/model and a positive number of seconds.`));
            return;
          }
          const ms = Math.round(value * 1000);
          if (ms <= 0) {
            setError(t(`第 ${index + 1} 行换算后不是正的毫秒数。`, `Line ${index + 1} does not convert to a positive millisecond value.`));
            return;
          }
          models[key] = ms;
        }
        const retryMs = Math.round(retrySeconds * 1000);
        const ptcMs = Math.round(ptcSeconds * 1000);
        setBusy('timeouts');
        setError('');
        try {
          const ok = await form.mutate([
            { op: 'set', path: ['retryAttempts'], value: attempts },
            { op: 'set', path: ['retryDelayMs'], value: retryMs },
            { op: 'set', path: ['ptcTimeoutMs'], value: ptcMs },
            { op: 'set', path: ['ptcModelTimeouts'], value: models },
          ], snapshot.revision);
          if (ok) {
            setSnapshot(form.getSnapshot());
            setTimeoutsDirty(false);
          } else {
            setError(t('保存未被接受；请刷新后重试。', 'The save was not accepted; refresh and retry.'));
          }
        } catch {
          setError(t('无法保存配置，请检查连接后重试。', 'Could not save the configuration; check the connection and retry.'));
        } finally {
          setBusy('');
        }
      };

      return h('div', { style: styles.root },
        h('h3', { style: styles.heading }, t('上下文压缩', 'Context compaction')),
        ...SWITCHES.map((item) => h('label', { key: item.key, style: styles.row },
          h('input', {
            type: 'checkbox',
            checked: effective(value, item.key, item.fallback),
            disabled: !ready || busy !== '',
            onChange: () => { void toggle(item.key, item.fallback); },
          }),
          h('span', { style: styles.label }, t(item.zh, item.en)),
          h('span', { style: styles.hint }, t(item.zhHint, item.enHint)),
        )),
        h('h4', { style: styles.sectionHeading }, t('超时与重试（秒）', 'Timeouts and retries (seconds)')),
        h('label', { key: 'retryAttempts', style: styles.field },
          h('span', { style: styles.label }, t('瞬时失败重试次数', 'Transient retry attempts')),
          h('input', {
            type: 'number', min: 0, max: 5, step: 1,
            value: timeoutDraft.retryAttempts,
            disabled: !ready || busy !== '',
            style: styles.number,
            onChange: (event: any) => {
              setTimeoutDraft((previous: any) => ({ ...previous, retryAttempts: String(event?.target?.value ?? '') }));
              setTimeoutsDirty(true);
            },
          }),
          h('span', { style: styles.fieldHint }, t('0–5 次；确定性失败不会重试。', '0–5 additional attempts; deterministic failures are not retried.')),
        ),
        h('label', { key: 'retryDelay', style: styles.field },
          h('span', { style: styles.label }, t('重试基础延迟（秒）', 'Retry base delay (seconds)')),
          h('input', {
            type: 'number', min: 0, max: 60, step: 0.1,
            value: timeoutDraft.retryDelay,
            disabled: !ready || busy !== '',
            style: styles.number,
            onChange: (event: any) => {
              setTimeoutDraft((previous: any) => ({ ...previous, retryDelay: String(event?.target?.value ?? '') }));
              setTimeoutsDirty(true);
            },
          }),
          h('span', { style: styles.fieldHint }, t('按尝试次数翻倍，配置上限 60 秒。', 'Doubles per attempt; configuration cap is 60 seconds.')),
        ),
        h('label', { key: 'ptcTimeout', style: styles.field },
          h('span', { style: styles.label }, t('PTC 默认预算（秒，0 = 部署默认）', 'PTC default budget (seconds, 0 = deployment default)')),
          h('input', {
            type: 'number', min: 0, step: 1,
            value: timeoutDraft.ptcTimeout,
            disabled: !ready || busy !== '',
            style: styles.number,
            onChange: (event: any) => {
              setTimeoutDraft((previous: any) => ({ ...previous, ptcTimeout: String(event?.target?.value ?? '') }));
              setTimeoutsDirty(true);
            },
          }),
          h('span', { style: styles.fieldHint }, t('仅在 run_code 未显式传 timeoutMs 时生效；会被 runtime 上限截断。', 'Only when run_code omits timeoutMs; capped by the runtime maximum.')),
        ),
        h('label', { key: 'ptcModels', style: styles.field },
          h('span', { style: styles.label }, t('按模型覆盖 PTC 预算（秒）', 'Per-model PTC budgets (seconds)')),
          h('textarea', {
            rows: 3,
            value: timeoutDraft.ptcModels,
            disabled: !ready || busy !== '',
            style: { ...styles.textarea, minHeight: 72 },
            placeholder: 'provider/model = 600',
            'aria-label': t('按模型覆盖 PTC 预算', 'Per-model PTC budgets'),
            onChange: (event: any) => {
              setTimeoutDraft((previous: any) => ({ ...previous, ptcModels: String(event?.target?.value ?? '') }));
              setTimeoutsDirty(true);
            },
          }),
          h('span', { style: styles.fieldHint }, t('每行 provider/model = 秒；留空表示无覆盖。', 'One provider/model = seconds per line; empty means no overrides.')),
        ),
        h('div', { style: styles.actions },
          h('button', {
            type: 'button',
            style: styles.button,
            disabled: !ready || busy !== '' || !timeoutsDirty,
            onClick: () => { void saveTimeouts(); },
          }, busy === 'timeouts' ? t('保存中…', 'Saving…') : t('保存超时设置', 'Save timeout settings')),
          timeoutsDirty ? h('span', { style: styles.note }, t('有未保存修改', 'Unsaved changes')) : null,
        ),
        h('label', { key: 'guidanceText', style: { display: 'grid', gap: 6 } },
          h('span', { style: styles.label }, t('自定义策略文本（可选）', 'Custom policy text (optional)')),
          h('textarea', {
            rows: 6,
            value: policyDraft,
            maxLength: 8000,
            disabled: !ready || busy !== '',
            style: styles.textarea,
            'aria-label': t('自定义策略文本', 'Custom policy text'),
            onChange: (event: any) => {
              setPolicyDraft(String(event?.target?.value ?? ''));
              setPolicyDirty(true);
            },
          }),
          h('span', { style: styles.hintBlock }, t(
            '留空 = 使用内置默认策略；仅当“上下文策略段”开启时生效。也可以把策略写在 AGENTS.md，然后保持上面的开关关闭。',
            'Empty = built-in default; used only when the policy section is on. You can also put the strategy in AGENTS.md and leave the switch off.',
          )),
        ),
        h('div', { style: styles.actions },
          h('button', {
            type: 'button',
            style: styles.button,
            disabled: !ready || busy !== '' || !policyChanged,
            onClick: () => { void savePolicy(); },
          }, busy === 'guidanceText' ? t('保存中…', 'Saving…') : t('保存策略', 'Save policy')),
          policyChanged ? h('span', { style: styles.note }, t('有未保存修改', 'Unsaved changes')) : null,
        ),
        h('p', { style: styles.note }, t(
          '开关立即保存；超时与重试使用上面的保存按钮（秒为单位）。水位参数（notifyAtRatio、pressureStep）仍在行配置；压缩阈值/保留量属于 compaction 配置。',
          'Switches save immediately; timeouts and retries use the save button above (seconds). Watermark settings (notifyAtRatio, pressureStep) stay in the row config; compaction threshold/retention belong to the compaction config.',
        )),
        error === '' ? null : h('p', { style: styles.error, role: 'alert' }, error),
      );
    }

    function apply(ctx: any): void {
      const form = ctx.configForms.get(ROW_ID);
      if (form === undefined) return;
      ctx.effect(() => ctx.configForms.whileServed?.([ROW_ID], () => {
        const dispose = (value: unknown): void => {
          if (typeof value === 'function') value();
        };
        const row = ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: BUNDLE_ID + '#' + ROW_ID,
          inject: () => ({ configForm: form }),
        }, ConfigView));
        // The bundle has one row, so show the same form on the package page
        // too; otherwise the configuration is only reachable from the row
        // detail behind the component's chevron.
        const bundle = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: BUNDLE_ID,
          inject: () => ({ configForm: form }),
        }, ConfigView));
        return () => {
          dispose(row);
          dispose(bundle);
        };
      }), 'dsh-tool-compact-context: settings');
    }

    const exported: any = {};
    Object.defineProperty(exported, Symbol.toStringTag, { value: 'Module' });
    exported.inject = ['slots', 'configForms'];
    exported.apply = apply;
    exported.ConfigView = ConfigView;
    return exported;
  },
});
