import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PLAYBOOK_SECTIONS, PlaybookSection, searchPlaybook, flattenSections } from "@/data/playbook";
import {
  BookOpen, Target, Shield, HeartPulse, AlertTriangle, TrendingUp,
  Users, Search, Star, FileText, Download, ExternalLink, Clock, ChevronRight, ChevronDown, Plus, Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen, Target, Shield, HeartPulse, AlertTriangle, TrendingUp, Users,
};

export default function Playbook() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string>(PLAYBOOK_SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("playbook_bookmarks");
    return saved ? new Set(JSON.parse(saved)) : new Set<string>();
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PLAYBOOK_SECTIONS.map(s => s.id)));

  const allSections = useMemo(() => flattenSections(PLAYBOOK_SECTIONS), []);
  const searchResults = useMemo(() => searchQuery.length >= 2 ? searchPlaybook(searchQuery) : null, [searchQuery]);
  const selectedSection = allSections.find(s => s.id === selectedId) || PLAYBOOK_SECTIONS[0];

  const toggleBookmark = (id: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("playbook_bookmarks", JSON.stringify([...next]));
      return next;
    });
    toast.success(bookmarks.has(id) ? "Removed from bookmarks" : "Added to bookmarks");
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const displaySections = searchResults ?? PLAYBOOK_SECTIONS;

  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-3rem)] max-w-[1400px]">
      {/* Left panel — Tree navigation */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col bg-secondary/30 rounded-l-lg">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground tracking-wide">Playbook</h2>
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add section</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search playbook..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-2 pb-4">
          <nav className="space-y-0.5">
            {searchResults ? (
              searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-4">No results found</p>
              ) : (
                searchResults.map(section => (
                  <NavItem
                    key={section.id}
                    section={section}
                    isSelected={selectedId === section.id}
                    isBookmarked={bookmarks.has(section.id)}
                    onSelect={setSelectedId}
                    depth={0}
                  />
                ))
              )
            ) : (
              PLAYBOOK_SECTIONS.map(section => (
                <div key={section.id}>
                  <div className="flex items-center">
                    {section.children && section.children.length > 0 && (
                      <button
                        className="p-1 hover:bg-muted rounded mr-0.5"
                        onClick={() => toggleGroup(section.id)}
                      >
                        {expandedGroups.has(section.id) ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    )}
                    <div className="flex-1">
                      <NavItem
                        section={section}
                        isSelected={selectedId === section.id}
                        isBookmarked={bookmarks.has(section.id)}
                        onSelect={setSelectedId}
                        depth={0}
                      />
                    </div>
                  </div>
                  {section.children && expandedGroups.has(section.id) && (
                    <div className="ml-4">
                      {section.children.map(child => (
                        <NavItem
                          key={child.id}
                          section={child}
                          isSelected={selectedId === child.id}
                          isBookmarked={bookmarks.has(child.id)}
                          onSelect={setSelectedId}
                          depth={1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </nav>
        </ScrollArea>
      </div>

      {/* Right panel — Content viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Content header */}
        <div className="px-8 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{selectedSection.title}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Last updated: {selectedSection.lastUpdated}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 ${bookmarks.has(selectedSection.id) ? "text-warning" : "text-muted-foreground"}`}
              onClick={() => toggleBookmark(selectedSection.id)}
            >
              <Star className={`h-4 w-4 mr-1 ${bookmarks.has(selectedSection.id) ? "fill-warning" : ""}`} />
              {bookmarks.has(selectedSection.id) ? "Bookmarked" : "Bookmark"}
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
          </div>
        </div>

        {/* Content body */}
        <ScrollArea className="flex-1">
          <div className="px-8 py-6 max-w-3xl">
            <article className="prose prose-sm max-w-none text-foreground
              prose-headings:text-foreground prose-headings:font-semibold
              prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3
              prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2
              prose-p:text-sm prose-p:leading-relaxed prose-p:text-muted-foreground
              prose-li:text-sm prose-li:text-muted-foreground
              prose-strong:text-foreground prose-strong:font-semibold
              prose-table:text-sm
              prose-th:text-left prose-th:font-medium prose-th:text-foreground prose-th:bg-muted prose-th:px-3 prose-th:py-2
              prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border prose-td:text-muted-foreground
              prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-blockquote:italic
              prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1 prose-code:rounded
            ">
              <MarkdownRenderer content={selectedSection.content} />
            </article>

            {/* Templates */}
            {selectedSection.templates && selectedSection.templates.length > 0 && (
              <div className="mt-8">
                <Separator className="mb-6" />
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Downloadable Templates
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedSection.templates.map((t, i) => (
                    <Card key={i} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.name}</p>
                            <Badge variant="secondary" className="text-[10px] mt-0.5">{t.type}</Badge>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <Download className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Action Links */}
            {selectedSection.actionLinks && selectedSection.actionLinks.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedSection.actionLinks.map((a, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => navigate(a.url)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" />
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Nav item ───

function NavItem({ section, isSelected, isBookmarked, onSelect, depth }: {
  section: PlaybookSection;
  isSelected: boolean;
  isBookmarked: boolean;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const Icon = ICON_MAP[section.icon] || BookOpen;
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors text-xs
        ${isSelected
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }
        ${depth > 0 ? "pl-4" : ""}
      `}
      onClick={() => onSelect(section.id)}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate flex-1">{section.title}</span>
      {isBookmarked && <Star className="h-3 w-3 text-warning fill-warning flex-shrink-0" />}
    </button>
  );
}

// ─── Simple markdown renderer ───

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i}>{line.slice(3)}</h2>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i}>{line.slice(4)}</h3>);
      i++; continue;
    }

    // Table
    if (line.includes("|") && lines[i + 1]?.includes("---")) {
      const headers = line.split("|").filter(Boolean).map(h => h.trim());
      i += 2; // skip separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").filter(Boolean).map(c => c.trim()));
        i++;
      }
      elements.push(
        <table key={`table-${i}`}>
          <thead>
            <tr>{headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(<blockquote key={i}><p>{line.slice(2)}</p></blockquote>);
      i++; continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`}>
          {items.map((item, j) => <li key={j}><InlineMarkdown text={item} /></li>)}
        </ol>
      );
      continue;
    }

    // Unordered list
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`}>
          {items.map((item, j) => <li key={j}><InlineMarkdown text={item} /></li>)}
        </ul>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++; continue;
    }

    // Paragraph
    elements.push(<p key={i}><InlineMarkdown text={line} /></p>);
    i++;
  }

  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i}>{part.slice(1, -1)}</code>;
        }
        // Handle em dashes with inline bold
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
