import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/Layout";
import NotePage from "@/pages/NotePage";
import DocumentPage from "@/pages/DocumentPage";
import SideBySidePage from "@/pages/SideBySidePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="notes/:noteId" element={<NotePage />} />
          <Route path="documents/:documentId" element={<DocumentPage />} />
          <Route path="documents/:documentId/notes/:noteId" element={<SideBySidePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
