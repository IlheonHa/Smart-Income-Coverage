/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare, 
  ChevronRight, 
  Loader2, 
  Copy, 
  Download,
  ShieldCheck,
  TrendingDown,
  AlertTriangle,
  RefreshCcw,
  User,
  Users,
  LogOut,
  Trash2,
  UserPlus,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { generateInsuranceReport } from './services/geminiService';
import { supabase } from './lib/supabase';

// Use a more reliable worker initialization for Vite
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ReportData {
  customerName: string;
  reportTitle: string;
  greeting: string;
  summary: string;
  consultingPoints: { title: string; content: string }[];
  problems: { title: string; description: string; solution: string }[];
  remodelingPoints: {
    keyIssues: string;
    actionPlan: string;
    optimizedPremium: string;
  };
  counselingScript: string;
  additionalChecklist: string[];
}

const FOCUS_OPTIONS = [
  { id: 'over', label: '과잉/중복 보장', icon: ShieldCheck },
  { id: 'under', label: '부족 보장', icon: AlertTriangle },
  { id: 'renewal', label: '갱신/납입 구조', icon: RefreshCcw },
  { id: 'remodel', label: '리모델링 포인트', icon: TrendingDown },
  { id: 'etc', label: '기타 특이사항', icon: MessageSquare },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  
  const [step, setStep] = useState(0); // Start at 0 for API Key setup

  React.useEffect(() => {
    // Session recovery disabled to force login every time as per user request
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const role = session.user.email === 'hih@sciencecenter.or.kr' ? 'admin' : 'user';
        setCurrentUser({ id: session.user.email || session.user.id, role });
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
  const [userApiKey, setUserApiKey] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pdfText, setPdfText] = useState('');
  const [fileName, setFileName] = useState('');
  const [focusPoints, setFocusPoints] = useState<string[]>([]);
  const [additionalComments, setAdditionalComments] = useState('');
  const [toneSample, setToneSample] = useState('');
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    if (userApiKey) {
      setStep(1);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('PDF 파일만 업로드 가능합니다.');
      return;
    }

    setFileName(file.name);
    setError(null);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ');
        fullText += pageText + '\n';
      }
      
      if (!fullText.trim()) {
        throw new Error('PDF에서 텍스트를 추출할 수 없습니다. 이미지로 된 PDF인지 확인해주세요.');
      }
      
      setPdfText(fullText);
    } catch (err) {
      console.error('PDF parsing error:', err);
      setError('PDF 파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  const toggleFocusPoint = (label: string) => {
    setFocusPoints(prev => 
      prev.includes(label) ? prev.filter(p => p !== label) : [...prev, label]
    );
  };

  const handleGenerate = async () => {
    if (!userApiKey) {
      setError('Gemini API Key를 먼저 설정해주세요.');
      setStep(0);
      return;
    }
    if (!pdfText) {
      setError('보험 분석 PDF를 먼저 업로드해주세요.');
      setStep(1);
      return;
    }
    if (focusPoints.length === 0) {
      setError('최소 하나 이상의 컨설팅 포인트를 선택해주세요.');
      setStep(2);
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await generateInsuranceReport({
        pdfText,
        focusPoints,
        additionalComments,
        toneSample,
        apiKey: userApiKey
      });
      setReport(result);
      setStep(4);
    } catch (err: any) {
      setError(err.message || '리포트 생성 중 오류가 발생했습니다. API Key가 유효한지 확인해주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('클립보드에 복사되었습니다.');
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    
    setIsDownloading(true);
    try {
      const element = reportRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#F8FAFC',
        windowWidth: 1200,
        onclone: (clonedDoc) => {
          try {
            // Aggressively remove all oklab/oklch from the entire document's HTML
            // This is the most reliable way to stop html2canvas from seeing 이 strings
            const stripColors = (html: string) => {
              return html.replace(/okl[abch]+\([^)]+\)/g, '#1e293b');
            };

            if (clonedDoc.documentElement) {
              // We do it in chunks to be safer, or just style tags + inline styles
              const styleTags = clonedDoc.getElementsByTagName('style');
              for (let i = 0; i < styleTags.length; i++) {
                styleTags[i].innerHTML = stripColors(styleTags[i].innerHTML);
              }

              const allElements = clonedDoc.getElementsByTagName('*');
              for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i] as HTMLElement;
                if (el.style && el.style.cssText) {
                  el.style.cssText = stripColors(el.style.cssText);
                }
                // Handle SVG attributes
                if (el.tagName.toLowerCase() === 'svg' || el.parentElement?.tagName.toLowerCase() === 'svg') {
                  ['fill', 'stroke', 'stop-color'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val && (val.includes('okl'))) {
                      el.setAttribute(attr, '#1e293b');
                    }
                  });
                }
              }
            }

            const clonedReport = clonedDoc.getElementById('report-container');
            if (clonedReport) {
              clonedReport.style.width = '1000px';
              clonedReport.style.margin = '0 auto';
              clonedReport.style.padding = '40px';
              clonedReport.style.height = 'auto';
              clonedReport.style.backgroundColor = '#F8FAFC';
            }

            // Hide counseling script in PDF
            const script = clonedDoc.getElementById('counseling-script');
            if (script) {
              script.style.display = 'none';
            }

            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              * { 
                transition: none !important;
                animation: none !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-shadow: none !important;
                text-shadow: none !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          } catch (e) {
            console.error('Error in onclone:', e);
          }
        }
      });
      
      if (!canvas) throw new Error('Canvas generation failed');

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      // Subsequent pages if content is long
      while (heightLeft > 1) { // Use 1mm epsilon to avoid empty last page
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }

      pdf.save(`SmartIncome_Report_${report?.customerName || 'Analysis'}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('PDF 생성 중 오류가 발생했습니다. 브라우저를 새로고침하거나 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 마스터 계정 체크
    if (loginId === 'admin' && loginPw === '260301') {
      setCurrentUser({ id: 'admin', role: 'admin' });
      return;
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginId,
        password: loginPw,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials' ? '아이디 또는 비밀번호가 일치하지 않습니다.' : authError.message);
        return;
      }

      if (data.user) {
        const role = data.user.email === 'hih@sciencecenter.or.kr' ? 'admin' : 'user';
        setCurrentUser({ id: data.user.email || data.user.id, role });
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setShowUserMgmt(false);
    setStep(0);
    setLoginId('');
    setLoginPw('');
    setUserApiKey('');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200 border border-slate-50"
        >
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-[#0F172A] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-slate-200">
              <ShieldCheck className="text-[#D4AF37] w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-brand-gradient mb-2">Smart Income Coverage</h1>
            <p className="text-slate-400 text-sm font-medium">서비스 이용을 위해 로그인해주세요</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">ID</label>
              <input 
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                placeholder="아이디를 입력하세요"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
              <input 
                type="password"
                value={loginPw}
                onChange={(e) => setLoginPw(e.target.value)}
                className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                placeholder="비밀번호를 입력하세요"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-[#0F172A] text-white py-5 rounded-2xl font-bold shadow-lg shadow-slate-200 hover:bg-[#1E293B] transition-all"
            >
              로그인
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0F172A] rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
              <ShieldCheck className="text-[#D4AF37] w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-brand-gradient">Smart Income Coverage</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.15em]">AI Coverage Analysis for Insurance Advisors</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {currentUser.role === 'admin' && (
              <button 
                onClick={() => setShowUserMgmt(!showUserMgmt)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${showUserMgmt ? 'bg-[#0F172A] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                <Users className="w-4 h-4" />
                접속자 관리
              </button>
            )}
            <button 
              onClick={() => setStep(0)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${step === 0 ? 'bg-[#D4AF37] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              title="API Key 설정"
            >
              <ShieldAlert className="w-4 h-4" />
              API 설정
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <AnimatePresence mode="wait">
          {showUserMgmt && currentUser.role === 'admin' ? (
            <UserManagementView key="mgmt" />
          ) : (
            <motion.div 
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="hidden md:flex items-center justify-center gap-4 text-xs text-slate-400 font-semibold mb-12">
                <span className={step === 0 ? 'text-[#0F172A]' : ''}>API Setup</span>
                <ChevronRight className="w-3 h-3" />
                <span className={step === 1 ? 'text-[#0F172A]' : ''}>Upload</span>
                <ChevronRight className="w-3 h-3" />
                <span className={step === 2 ? 'text-[#0F172A]' : ''}>Analysis</span>
                <ChevronRight className="w-3 h-3" />
                <span className={step === 3 ? 'text-[#0F172A]' : ''}>Style</span>
              </div>
              
              <AnimatePresence mode="wait">
                {/* ... existing steps ... */}
          {step === 0 && (
            <motion.div 
              key="step0"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-3xl p-10 shadow-xl shadow-slate-200/50 border border-slate-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-slate-50 rounded-full -mr-20 -mt-20" />
                
                <h2 className="text-3xl font-bold mb-4">Welcome to Smart Income</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                  전문적인 보험 분석을 위해 개인 Gemini API Key를 설정해주세요.<br />
                  보안을 위해 입력하신 정보는 로컬 세션에서만 안전하게 처리됩니다.
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Gemini API Key</label>
                    <div className="relative">
                      <input 
                        type="password"
                        value={userApiKey}
                        onChange={(e) => setUserApiKey(e.target.value)}
                        placeholder="AI Studio API Key를 입력하세요"
                        className="w-full p-4 pr-12 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 focus:border-transparent outline-none transition-all font-mono text-sm"
                      />
                      {userApiKey && (
                        <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 w-5 h-5" />
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-[#D4AF37]" />
                      API Key 발급 안내
                    </h3>
                    <ol className="text-sm text-slate-600 space-y-3 list-decimal list-inside">
                      <li><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#0F172A]">Google AI Studio</a>에서 키를 생성합니다.</li>
                      <li>생성된 키를 복사하여 위 입력창에 붙여넣으세요.</li>
                      <li className="text-xs opacity-70 italic">발급은 무료이며, 보안이 유지됩니다.</li>
                    </ol>
                  </div>
                </div>

                <button 
                  disabled={!userApiKey}
                  onClick={handleStart}
                  className="w-full mt-10 bg-[#0F172A] text-white py-5 rounded-2xl font-bold shadow-lg shadow-slate-200 hover:bg-[#1E293B] active:scale-[0.99] transition-all disabled:opacity-30"
                >
                  분석 시작하기
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-10 shadow-xl shadow-slate-200/50 border border-slate-50">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                    <Upload className="text-[#0F172A] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">PDF 파일 업로드</h2>
                    <p className="text-sm text-slate-400">분석할 보장분석 리포트를 선택해주세요.</p>
                  </div>
                </div>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`group border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all ${fileName ? 'border-slate-300 bg-slate-50/50' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept=".pdf" 
                    className="hidden" 
                  />
                  {fileName ? (
                    <>
                      <div className="w-20 h-20 bg-white rounded-2xl shadow-md flex items-center justify-center mb-6">
                        <FileText className="w-10 h-10 text-[#0F172A]" />
                      </div>
                      <p className="font-bold text-lg text-slate-800">{fileName}</p>
                      <button className="mt-4 text-sm text-slate-500 font-semibold hover:text-[#0F172A] underline">파일 변경</button>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-slate-100 transition-colors">
                        <Upload className="w-10 h-10 text-slate-300 group-hover:text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-medium">분석할 PDF를 선택하세요</p>
                      <p className="text-xs text-slate-400 mt-3 font-bold tracking-widest">PDF ONLY</p>
                    </>
                  )}
                </div>

                {error && (
                  <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <div className="flex gap-4 mt-10">
                  <button 
                    onClick={() => setStep(0)}
                    className="flex-1 bg-slate-50 text-slate-500 py-5 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                  >
                    이전으로
                  </button>
                  <button 
                    disabled={!pdfText}
                    onClick={() => setStep(2)}
                    className="flex-[2] bg-[#0F172A] text-white py-5 rounded-2xl font-bold shadow-lg shadow-slate-200 hover:bg-[#1E293B] transition-all disabled:opacity-30"
                  >
                    다음 단계
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-10 shadow-xl shadow-slate-200/50 border border-slate-50">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                    <ShieldCheck className="text-[#0F172A] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">분석 포인트 설정</h2>
                    <p className="text-sm text-slate-400">고객에게 강조할 핵심 항목을 선택하세요.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {FOCUS_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => toggleFocusPoint(option.label)}
                      className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left group ${focusPoints.includes(option.label) ? 'border-[#0F172A] bg-slate-50' : 'border-slate-50 hover:border-slate-100'}`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${focusPoints.includes(option.label) ? 'bg-[#0F172A] text-[#D4AF37]' : 'bg-slate-50 text-slate-400'}`}>
                        <option.icon className="w-6 h-6" />
                      </div>
                      <span className={`font-bold ${focusPoints.includes(option.label) ? 'text-[#0F172A]' : 'text-slate-600'}`}>{option.label}</span>
                      {focusPoints.includes(option.label) && <CheckCircle2 className="ml-auto w-6 h-6 text-[#0F172A]" />}
                    </button>
                  ))}
                </div>

                <div className="flex gap-4 mt-10">
                  <button 
                    onClick={() => setStep(1)}
                    className="flex-1 bg-slate-50 text-slate-500 py-5 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                  >
                    이전으로
                  </button>
                  <button 
                    disabled={focusPoints.length === 0}
                    onClick={() => setStep(3)}
                    className="flex-[2] bg-[#0F172A] text-white py-5 rounded-2xl font-bold shadow-lg shadow-slate-200 hover:bg-[#1E293B] transition-all disabled:opacity-30"
                  >
                    스타일 설정
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-10 shadow-xl shadow-slate-200/50 border border-slate-50">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                    <MessageSquare className="text-[#0F172A] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">상담 스타일</h2>
                    <p className="text-sm text-slate-400">설계사님의 개별화된 메시지를 구성합니다.</p>
                  </div>
                </div>
                
                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">상담 말투 샘플</label>
                    <textarea 
                      value={toneSample}
                      onChange={(e) => setToneSample(e.target.value)}
                      placeholder="평소 고객에게 보내는 인사말이나 말투를 입력하세요."
                      className="w-full h-40 p-5 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none resize-none transition-all text-sm leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">추가 분석 의견</label>
                    <textarea 
                      value={additionalComments}
                      onChange={(e) => setAdditionalComments(e.target.value)}
                      placeholder="고객의 특이사항이나 강조하고 싶은 내용을 입력하세요."
                      className="w-full h-40 p-5 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none resize-none transition-all text-sm leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-10">
                  <button 
                    onClick={() => setStep(2)}
                    className="flex-1 bg-slate-50 text-slate-500 py-5 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                  >
                    이전으로
                  </button>
                  <button 
                    disabled={isAnalyzing}
                    onClick={handleGenerate}
                    className="flex-[2] bg-[#0F172A] text-white py-5 rounded-2xl font-bold shadow-lg shadow-slate-200 hover:bg-[#1E293B] flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        AI 분석 중...
                      </>
                    ) : (
                      '리포트 생성'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && report && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10 pb-24"
            >
              <div ref={reportRef} id="report-container" className="space-y-10 p-4 bg-[#F8FAFC] w-full max-w-5xl mx-auto">
                {/* Report Header */}
                <div className="bg-white rounded-[2.5rem] p-12 shadow-2xl shadow-slate-100 border border-slate-50 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-[#0F172A]" />
                  <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck className="w-10 h-10 text-[#D4AF37]" />
                  </div>
                  <h2 className="text-3xl font-bold mb-3 tracking-tight">{report.reportTitle}</h2>
                  <div className="accent-line h-px w-24 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold tracking-widest uppercase text-[10px]">{report.customerName} ANALYSIS REPORT</p>
                </div>

                {/* Summary Section */}
                <div className="bg-[#0F172A] rounded-[2.5rem] p-12 shadow-2xl shadow-slate-300 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <ShieldCheck className="w-40 h-40" />
                  </div>
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                    <MessageSquare className="w-6 h-6 text-[#D4AF37]" />
                    Executive Summary
                  </h3>
                  <p className="text-lg leading-relaxed font-medium opacity-90">
                    "{report.summary}"
                  </p>
                </div>

                {/* Detailed Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-100 border border-slate-50">
                    <h3 className="text-lg font-bold mb-8 flex items-center gap-3 text-[#0F172A]">
                      <CheckCircle2 className="w-5 h-5 text-[#D4AF37]" />
                      분석 포인트
                    </h3>
                    <div className="space-y-8">
                      {report.consultingPoints.map((point, i) => (
                        <div key={i} className="relative pl-6">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-100 rounded-full" />
                          <h4 className="font-bold text-slate-800 mb-2">{point.title}</h4>
                          <p className="text-slate-500 text-sm leading-relaxed">{point.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-100 border border-slate-50">
                    <h3 className="text-lg font-bold mb-8 flex items-center gap-3 text-red-600">
                      <AlertTriangle className="w-5 h-5" />
                      핵심 리스크
                    </h3>
                    <div className="space-y-6">
                      {report.problems.map((prob, i) => (
                        <div key={i} className="bg-red-50/30 rounded-2xl p-6 border border-red-50">
                          <h4 className="font-bold text-red-900 mb-2">{prob.title}</h4>
                          <p className="text-red-700 text-sm mb-4 leading-relaxed">{prob.description}</p>
                          <div className="bg-white rounded-xl p-4 text-xs border border-red-100 shadow-sm">
                            <span className="font-bold text-[#0F172A] uppercase text-[9px] tracking-widest block mb-1">Recommended Solution</span>
                            <p className="text-slate-600">{prob.solution}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Remodeling Section */}
                <div className="bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-100 border border-slate-50">
                  <h3 className="text-lg font-bold mb-8 flex items-center gap-3 text-emerald-600">
                    <TrendingDown className="w-5 h-5" />
                    리모델링 전략
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="bg-slate-50 rounded-2xl p-6">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-3">핵심 사유</span>
                      <p className="text-sm font-bold text-slate-800">{report.remodelingPoints.keyIssues}</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-6">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-3">실행 계획</span>
                      <p className="text-sm font-bold text-slate-800">{report.remodelingPoints.actionPlan}</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-6 border-l-2 border-[#D4AF37]">
                      <span className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-widest block mb-3">보험료 최적화</span>
                      <p className="text-sm font-bold text-slate-800">{report.remodelingPoints.optimizedPremium}</p>
                    </div>
                  </div>
                </div>

                {/* Counseling Script */}
                <div id="counseling-script" className="bg-[#FEE500] rounded-[2rem] p-10 shadow-xl">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold flex items-center gap-3 text-[#3C1E1E]">
                      <MessageSquare className="w-5 h-5" />
                      상담용 스크립트
                    </h3>
                    <button 
                      onClick={() => copyToClipboard(report.counselingScript)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/60 rounded-xl hover:bg-white transition-all text-xs font-bold shadow-sm"
                    >
                      <Copy className="w-4 h-4" />
                      복사
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl p-8 text-[#3C1E1E] leading-relaxed whitespace-pre-wrap text-[14px] shadow-inner">
                    {report.counselingScript}
                  </div>
                </div>
              </div>

              <div className="flex gap-6">
                <button 
                  onClick={() => setStep(1)}
                  className="flex-1 bg-white border border-slate-200 py-6 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm"
                >
                  새로운 분석
                </button>
                <button 
                  disabled={isDownloading}
                  onClick={handleDownloadPDF}
                  className="flex-[2] bg-[#0F172A] text-white py-6 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-[#1E293B] flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5 text-[#D4AF37]" />
                      리포트 저장
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )}
  </AnimatePresence>
</main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-8 h-0.5 bg-slate-200 mx-auto mb-8 rounded-full" />
        <p className="text-slate-400 font-bold tracking-widest uppercase text-[9px] mb-4">Smart Income Coverage AI</p>
        <p className="text-slate-300 text-[10px] leading-relaxed">
          본 리포트는 AI 분석 결과이며, 최종 상담 및 계약은 설계사의 확인이 필요합니다.<br />
          © 2026 Smart Income. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function UserManagementView() {
  const [users, setUsers] = useState<any[]>([]);
  const [newId, setNewId] = useState('');
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setUsers(data);
    }
  };

  React.useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // 1. Sign up the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newId,
      password: newPw,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    // 2. Add to profiles table
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          { id: newId, role: 'user', status: 'active' }
        ]);
      
      if (profileError) {
        setError(profileError.message);
      } else {
        setNewId('');
        setNewPw('');
        fetchUsers();
      }
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', id);
    
    if (!error) {
      fetchUsers();
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    // Note: This only deletes from profiles table. 
    // Deleting from Auth requires Admin API (Service Role Key).
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);
    
    if (!error) {
      fetchUsers();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="bg-white rounded-3xl p-10 shadow-xl shadow-slate-200/50 border border-slate-50">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
          <UserPlus className="w-6 h-6 text-[#D4AF37]" />
          신규 사용자 등록
        </h2>
        <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input 
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="아이디"
            className="p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none transition-all"
            required
          />
          <input 
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="비밀번호"
            className="p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none transition-all"
            required
          />
          <button 
            type="submit"
            className="bg-[#0F172A] text-white py-4 rounded-2xl font-bold hover:bg-[#1E293B] transition-all"
          >
            등록하기
          </button>
        </form>
        {error && <p className="mt-4 text-red-500 text-xs font-bold">{error}</p>}
      </div>

      <div className="bg-white rounded-3xl p-10 shadow-xl shadow-slate-200/50 border border-slate-50">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
          <Users className="w-6 h-6 text-[#0F172A]" />
          사용자 목록
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">ID</th>
                <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Role</th>
                <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((user) => (
                <tr key={user.id} className="group">
                  <td className="py-4 font-bold text-slate-700">{user.id}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-[#0F172A] text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      {user.id !== 'admin' && (
                        <>
                          <button 
                            onClick={() => toggleStatus(user.id, user.status)}
                            className={`p-2 rounded-xl transition-all ${user.status === 'active' ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                            title={user.status === 'active' ? '정지' : '활성화'}
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteUser(user.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
