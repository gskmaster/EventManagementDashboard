import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import Layout from '../components/Layout';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import {
  Mail, Plus, Search, Trash2, Save, X, ChevronRight, ArrowLeft,
  Bold, Italic, UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Heading1, Heading2, Loader2, FileText, Tag,
} from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

const VARIABLES = [
  { label: 'Nama Proyek', value: '{{namaProyek}}' },
  { label: 'Tgl Mulai', value: '{{tanggalMulai}}' },
  { label: 'Tgl Selesai', value: '{{tanggalSelesai}}' },
  { label: 'Manajer', value: '{{manajerProyek}}' },
  { label: 'Venue', value: '{{namaVenue}}' },
  { label: 'Nama Peserta', value: '{{namaPeserta}}' },
  { label: 'QR Code', value: '{{qrCodeUrl}}' },
];

// ── Rich Text Toolbar ──────────────────────────────────────────────────────────
function ToolbarButton({
  onClick, active, title, children,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded flex-shrink-0 transition-colors ${active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-slate-200 mx-0.5 self-center flex-shrink-0" />;
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  const insertVariable = useCallback((variable: string) => {
    editor?.chain().focus().insertContent(variable).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
      {/* Toolbar — scrollable on mobile */}
      <div className="overflow-x-auto border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-0.5 px-2 py-1.5 min-w-max">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Rata Kiri">
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Tengah">
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Rata Kanan">
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <Tag className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase mx-1 flex-shrink-0">Variabel</span>
          {VARIABLES.map((v) => (
            <button
              key={v.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertVariable(v.value); }}
              title={`Sisipkan ${v.label}`}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors whitespace-nowrap flex-shrink-0"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none min-h-[240px] px-4 py-3 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[220px]"
      />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: '', description: '', subject: '', body: '' };

export default function EmailTemplates() {
  const { profile } = useAuth();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'EmailTemplates'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailTemplate)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;
  const isEditing = isCreating || selectedId !== null;

  const startCreate = () => {
    setIsCreating(true);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const startEdit = (t: EmailTemplate) => {
    setIsCreating(false);
    setSelectedId(t.id);
    setForm({ name: t.name, description: t.description, subject: t.subject, body: t.body });
    setError('');
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setError('Nama, subjek, dan isi template wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      if (isCreating) {
        await addDoc(collection(db, 'EmailTemplates'), {
          ...form,
          createdAt: now,
          updatedAt: now,
          createdBy: profile?.email || '',
        });
      } else if (selectedId) {
        await updateDoc(doc(db, 'EmailTemplates', selectedId), { ...form, updatedAt: now });
      }
      setForm(EMPTY_FORM);
      setSelectedId(null);
      setIsCreating(false);
    } catch (err) {
      console.error(err);
      setError('Gagal menyimpan template. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'EmailTemplates', id));
      if (selectedId === id) cancelEdit();
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  // ── List Panel ────────────────────────────────────────────────────────────
  const ListPanel = (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari template..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {search ? 'Tidak ada hasil' : 'Belum ada template'}
              </p>
            </div>
          ) : (
            filtered.map(t => (
              <div
                key={t.id}
                onClick={() => startEdit(t)}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
                  selectedId === t.id && !isCreating
                    ? 'bg-indigo-50 border-l-4 border-l-indigo-500'
                    : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                  <p className="text-xs text-slate-500 truncate">{t.description || t.subject}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Variables reference */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">Variabel Dinamis</p>
        <div className="space-y-1.5">
          {[
            { label: 'Nama Proyek', value: '{{namaProyek}}' },
            { label: 'Tanggal Mulai', value: '{{tanggalMulai}}' },
            { label: 'Tanggal Selesai', value: '{{tanggalSelesai}}' },
            { label: 'Manajer Proyek', value: '{{manajerProyek}}' },
            { label: 'Nama Venue', value: '{{namaVenue}}' },
            { label: 'Nama Peserta', value: '{{namaPeserta}}' },
            { label: 'QR Code URL', value: '{{qrCodeUrl}}' },
          ].map(v => (
            <div key={v.value} className="flex items-center gap-2 flex-wrap">
              <code className="text-[11px] bg-white border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded font-mono">
                {v.value}
              </code>
              <span className="text-xs text-amber-700">→ {v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Editor Panel ──────────────────────────────────────────────────────────
  const EditorPanel = !isEditing ? (
    <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center py-24">
      <div className="text-center px-4">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-indigo-400" />
        </div>
        <p className="text-slate-600 font-medium">Pilih template untuk diedit</p>
        <p className="text-slate-400 text-sm mt-1">atau buat template baru</p>
        <button
          onClick={startCreate}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Buat Template Baru
        </button>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSave}>
      <div className="bg-white rounded-2xl border border-slate-200">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            {/* Back button on mobile */}
            <button
              type="button"
              onClick={cancelEdit}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-slate-900 truncate">
              {isCreating ? 'Template Baru' : `Edit: ${selectedTemplate?.name}`}
            </h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isCreating && selectedId && (
              <button
                type="button"
                onClick={() => setDeleteConfirm(selectedId)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Hapus</span>
              </button>
            )}
            <button
              type="button"
              onClick={cancelEdit}
              className="hidden lg:flex p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Name + Description — stacked on mobile, 2-col on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nama Template <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="cth. Undangan Seminar"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Deskripsi
              </label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Keterangan singkat template ini"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Subjek Email <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              placeholder="cth. Undangan {{namaProyek}} — {{tanggalMulai}}"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Gunakan variabel seperti <code className="bg-slate-100 px-1 rounded">{'{{namaProyek}}'}</code> di subjek.
            </p>
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Isi Email <span className="text-red-500">*</span>
            </label>
            <RichTextEditor
              value={form.body}
              onChange={body => setForm(f => ({ ...f, body }))}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Menyimpan...</>
              ) : (
                <><Save className="w-4 h-4" />Simpan Template</>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Template Email</h2>
            <p className="text-slate-500 mt-0.5 text-sm hidden sm:block">
              Kelola template email dengan variabel dinamis untuk proyek Anda.
            </p>
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Buat Template</span>
            <span className="sm:hidden">Buat</span>
          </button>
        </div>

        {/* Single layout — list and editor each rendered exactly once */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
          {/* List panel: visible on mobile only when not editing */}
          <div className={`w-full lg:w-72 lg:flex-shrink-0 ${isEditing ? 'hidden lg:block' : 'block'}`}>
            {ListPanel}
          </div>
          {/* Editor panel: visible on mobile only when editing */}
          <div className={`flex-1 min-w-0 w-full ${isEditing ? 'block' : 'hidden lg:block'}`}>
            {EditorPanel}
          </div>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Hapus Template?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Template ini akan dihapus permanen dan tidak dapat dikembalikan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
