import React, { useRef, useEffect } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Type } from 'lucide-react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
}

/**
 * Simple WYSIWYG editor built on contentEditable + document.execCommand.
 * No external dependencies. Pass a `key` prop from the parent to reset content.
 */
export default function RichTextEditor({ value, onChange, minHeight = '360px' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Set initial content only on mount. Parent must change `key` to reset.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cmd = (command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  // onMouseDown + preventDefault keeps editor focus when clicking toolbar buttons
  const Btn = ({
    title,
    onClick,
    children,
  }: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={e => {
        e.preventDefault();
        onClick();
      }}
      className="p-1.5 rounded text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-slate-50 border-b border-slate-200">
        <Btn title="Bold (Ctrl+B)" onClick={() => cmd('bold')}>
          <Bold className="w-4 h-4" />
        </Btn>
        <Btn title="Italic (Ctrl+I)" onClick={() => cmd('italic')}>
          <Italic className="w-4 h-4" />
        </Btn>
        <Btn title="Underline (Ctrl+U)" onClick={() => cmd('underline')}>
          <Underline className="w-4 h-4" />
        </Btn>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <Btn title="Heading 2" onClick={() => cmd('formatBlock', 'h2')}>
          <span className="text-xs font-bold leading-none px-0.5">H2</span>
        </Btn>
        <Btn title="Heading 3" onClick={() => cmd('formatBlock', 'h3')}>
          <span className="text-xs font-bold leading-none px-0.5">H3</span>
        </Btn>
        <Btn title="Normal text" onClick={() => cmd('formatBlock', 'p')}>
          <Type className="w-4 h-4" />
        </Btn>
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <Btn title="Bullet list" onClick={() => cmd('insertUnorderedList')}>
          <List className="w-4 h-4" />
        </Btn>
        <Btn title="Numbered list" onClick={() => cmd('insertOrderedList')}>
          <ListOrdered className="w-4 h-4" />
        </Btn>
      </div>

      {/* Editor area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          if (ref.current) onChange(ref.current.innerHTML);
        }}
        style={{ minHeight }}
        className="
          px-4 py-3 text-sm text-slate-800 outline-none overflow-auto leading-relaxed
          [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:mb-2
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
          [&_li]:mb-0.5
          [&_strong]:font-semibold
        "
      />
    </div>
  );
}
