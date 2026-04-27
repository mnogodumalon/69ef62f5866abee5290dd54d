import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import { WorkflowPlaceholders } from '@/components/WorkflowPlaceholders';
import AdminPage from '@/pages/AdminPage';
import MitarbeiterPage from '@/pages/MitarbeiterPage';
import SchichttypenPage from '@/pages/SchichttypenPage';
import SchichtplanPage from '@/pages/SchichtplanPage';
import PublicFormMitarbeiter from '@/pages/public/PublicForm_Mitarbeiter';
import PublicFormSchichttypen from '@/pages/public/PublicForm_Schichttypen';
import PublicFormSchichtplan from '@/pages/public/PublicForm_Schichtplan';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/69ef62e2b6a48346be756872" element={<PublicFormMitarbeiter />} />
              <Route path="public/69ef62e6d202ece719d2a852" element={<PublicFormSchichttypen />} />
              <Route path="public/69ef62e79b0fffcf8efd3748" element={<PublicFormSchichtplan />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<><div className="mb-8"><WorkflowPlaceholders /></div><DashboardOverview /></>} />
                <Route path="mitarbeiter" element={<MitarbeiterPage />} />
                <Route path="schichttypen" element={<SchichttypenPage />} />
                <Route path="schichtplan" element={<SchichtplanPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
