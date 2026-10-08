import {
  Children,
  cloneElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface SectionProps {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  children: ReactNode;
  active?: boolean;
  controlId?: string;
  panelId?: string;
}

export function WorkspaceSection({
  id,
  children,
  active = true,
  controlId,
  panelId,
}: SectionProps) {
  return (
    <section id={panelId} aria-labelledby={controlId} data-workspace-section={id} hidden={!active}>
      {children}
    </section>
  );
}

export function WorkspaceSections({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value?: string;
  onChange?: (id: string) => void;
  children: ReactNode;
}) {
  const sections = Children.toArray(children) as ReactElement<SectionProps>[];
  const [selected, setSelected] = useState(sections[0]?.props.id);
  const prefix = useId();
  const navigation = useRef<HTMLElement>(null);
  const current = value ?? selected;
  const active =
    sections.find((section) => section.props.id === current && !section.props.disabled) ??
    sections.find((section) => !section.props.disabled);
  function select(id: string) {
    if (sections.find((section) => section.props.id === id)?.props.disabled) return;
    setSelected(id);
    onChange?.(id);
    navigation.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  return (
    <div className="workspace-sections">
      <nav ref={navigation} className="section-navigation" aria-label={label}>
        {sections.map(({ props }) => (
          <button
            key={props.id}
            type="button"
            data-guide={`section-${props.id}`}
            disabled={props.disabled}
            aria-disabled={props.disabled || undefined}
            id={`${prefix}-${props.id}-control`}
            aria-controls={`${prefix}-${props.id}-panel`}
            aria-current={active?.props.id === props.id ? 'page' : undefined}
            onClick={() => select(props.id)}
          >
            {props.label}
          </button>
        ))}
      </nav>
      {active?.props.description && (
        <p className="section-description">{active.props.description}</p>
      )}
      {sections.map((section) =>
        cloneElement(section, {
          key: section.props.id,
          active: active?.props.id === section.props.id,
          controlId: `${prefix}-${section.props.id}-control`,
          panelId: `${prefix}-${section.props.id}-panel`,
        }),
      )}
    </div>
  );
}
