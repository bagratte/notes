import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/Layout";
import NotePage from "@/pages/NotePage";
import DocumentPage from "@/pages/DocumentPage";
import FolderPage from "@/pages/FolderPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="notes/:noteId" element={<NotePage />} />
          <Route path="documents/:documentId" element={<DocumentPage />} />
          <Route path="folders/:folderId" element={<FolderPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
