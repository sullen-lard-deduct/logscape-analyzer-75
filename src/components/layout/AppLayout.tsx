
import React from "react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, className }) => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto py-4 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-xl">LogScape Analyzer</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground/70">
              Beta
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a
              href="/"
              className="text-foreground/70 hover:text-foreground transition-colors"
            >
              Dashboard
            </a>
            <a
              href="#upload"
              className="text-foreground/70 hover:text-foreground transition-colors"
            >
              Upload
            </a>
            <a
              href="#analysis"
              className="text-foreground/70 hover:text-foreground transition-colors"
            >
              Analysis
            </a>
          </nav>
        </div>
      </header>
      <main className={cn("container mx-auto p-4 sm:p-6 animate-fade-in", className)}>
        {children}
      </main>
      <footer className="border-t border-border/40 py-6 mt-12">
        <div className="container mx-auto px-4 sm:px-6 text-center text-sm text-muted-foreground">
          <p>LogScape Analyzer &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;
