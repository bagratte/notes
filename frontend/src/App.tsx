import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/Layout";
import NotePage from "@/pages/NotePage";
import DocumentPage from "@/pages/DocumentPage";
import FolderPage from "@/pages/FolderPage";
import SettingsPage from "@/pages/SettingsPage";
import { TouchModeProvider } from "@/context/TouchMode";
import { DrawingSettingsProvider } from "@/context/DrawingSettings";

export default function App() {
  return (
    <TouchModeProvider>
    <DrawingSettingsProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="notes/:noteId" element={<NotePage />} />
          <Route path="documents/:documentId" element={<DocumentPage />} />
          <Route path="folders/:folderId" element={<FolderPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </DrawingSettingsProvider>
    </TouchModeProvider>
  );
}
