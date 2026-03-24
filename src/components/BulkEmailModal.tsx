import React, { useState, useMemo } from 'react';
import { 
  X, Search, Filter, ChevronLeft, ChevronRight, 
  CheckCircle2, AlertCircle, Loader2, Send, Mail,
  Users, CheckSquare, Square
} from 'lucide-react';
import RichTextEditor from './RichTextEditor';

interface Recipient {
  id: string;
  name: string;
  email: string;
  hasFile: boolean;
  hasKwitansi?: boolean;
  emailStatus?: 'sent' | 'failed' | null;
  variables: Record<string, string>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  recipients: Recipient[];
  templates: any[];
  onShowPreview: (html: string) => void;
  onSendBatch: (selectedIds: string[], templateId: string, emailBody: string) => Promise<void>;
  isSending: boolean;
  sendProgress: { current: number; total: number };
  variables: { label: string; value: string }[];
  mode?: 'tax' | 'certificate';
}

export default function BulkEmailModal({
  isOpen, onClose, title, recipients, templates,
  onShowPreview, onSendBatch, isSending, sendProgress, variables,
  mode = 'tax',
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with-file' | 'complete' | 'failed'>(
    mode === 'certificate' ? 'all' : 'with-file'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           r.email.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesFilter = true;
      if (mode === 'certificate') {
        if (filterType === 'complete') matchesFilter = r.hasFile;
        else if (filterType === 'failed') matchesFilter = r.emailStatus === 'failed';
      } else {
        if (filterType === 'with-file') matchesFilter = r.hasFile || !!r.hasKwitansi;
        else if (filterType === 'complete') matchesFilter = r.hasFile && !!r.hasKwitansi;
        else if (filterType === 'failed') matchesFilter = r.emailStatus === 'failed';
      }

      return matchesSearch && matchesFilter;
    });
  }, [recipients, searchTerm, filterType, mode]);

  // Pagination
  const totalPages = Math.ceil(filteredRecipients.length / itemsPerPage);
  const paginatedRecipients = filteredRecipients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecipients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecipients.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
              <Mail className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">Kirim email massal dengan template dinamis</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Template Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-teal-500 rounded-full" />
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">1. Pilih Template</h4>
            </div>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                const t = templates.find(x => x.id === e.target.value);
                if (t) setEmailBody(t.body);
              }}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all text-sm"
            >
              <option value="">Pilih template email...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {selectedTemplateId && (
              <RichTextEditor
                key={selectedTemplateId}
                value={emailBody}
                onChange={setEmailBody}
                variables={variables}
                minHeight="200px"
              />
            )}
          </div>

          {/* Section 2: Recipient Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-teal-500 rounded-full" />
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">2. Pilih Penerima</h4>
              </div>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                {selectedIds.size} dipilih dari {filteredRecipients.length}
              </span>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama atau email..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                {(mode === 'certificate'
                  ? (['all', 'complete', 'failed'] as const)
                  : (['with-file', 'complete', 'all', 'failed'] as const)
                ).map(type => (
                  <button
                    key={type}
                    onClick={() => { setFilterType(type); setCurrentPage(1); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      filterType === type ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {type === 'with-file' ? 'Ada File' : type === 'complete' ? 'Lengkap' : type === 'all' ? 'Semua' : 'Gagal'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipients Table */}
            <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="w-12 px-4 py-3 text-left">
                      <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-200 rounded transition-colors">
                        {selectedIds.size === filteredRecipients.length && filteredRecipients.length > 0
                          ? <CheckSquare className="w-4 h-4 text-teal-600" />
                          : <Square className="w-4 h-4 text-slate-400" />
                        }
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase text-[10px]">Penerima</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase text-[10px]">Status File</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase text-[10px]">Email Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedRecipients.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(r.id)} className="p-1 hover:bg-slate-200 rounded transition-colors">
                          {selectedIds.has(r.id)
                            ? <CheckSquare className="w-4 h-4 text-teal-600" />
                            : <Square className="w-4 h-4 text-slate-400" />
                          }
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-xs text-slate-400 font-medium">{r.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        {mode === 'certificate' ? (
                          r.hasFile ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase border border-emerald-100">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Sertifikat
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase border border-rose-100">
                              <AlertCircle className="w-2.5 h-2.5" /> Belum Generate
                            </span>
                          )
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {r.hasFile ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase border border-emerald-100">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Bupot
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase border border-rose-100">
                                <AlertCircle className="w-2.5 h-2.5" /> Bupot
                              </span>
                            )}
                            {r.hasKwitansi ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase border border-emerald-100">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Kwitansi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase border border-rose-100">
                                <AlertCircle className="w-2.5 h-2.5" /> Kwitansi
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.emailStatus === 'sent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider border border-emerald-100">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Terkirim
                          </span>
                        ) : r.emailStatus === 'failed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full text-[9px] font-bold uppercase tracking-wider border border-rose-100">
                            <AlertCircle className="w-2.5 h-2.5" /> Gagal
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRecipients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-medium italic">
                        Tidak ada penerima ditemukan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              
              {/* Pagination Footer */}
              {totalPages > 1 && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Halaman {currentPage} dari {totalPages}</span>
                  <div className="flex gap-1">
                    <button 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                      className="p-1.5 hover:bg-white rounded-lg border border-slate-200 disabled:opacity-30 transition-all shadow-sm"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <button 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                      className="p-1.5 hover:bg-white rounded-lg border border-slate-200 disabled:opacity-30 transition-all shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 w-full sm:w-auto">
            {isSending && (
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase">
                  <span>Mengirim Email...</span>
                  <span>{sendProgress.current} / {sendProgress.total}</span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className="h-full bg-teal-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(20,184,166,0.5)]"
                    style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
            >
              Batal
            </button>
            <button
              disabled={isSending || selectedIds.size === 0 || !selectedTemplateId}
              onClick={() => onSendBatch(Array.from(selectedIds), selectedTemplateId, emailBody)}
              className="flex items-center justify-center gap-2 px-8 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-bold hover:bg-teal-700 shadow-lg shadow-teal-600/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed min-w-[160px]"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Kirim ke {selectedIds.size}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
