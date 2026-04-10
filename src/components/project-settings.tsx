"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Environment {
  id?: string;
  name: string;
  baseUrl: string;
  variables: string;
}

interface GlobalHeader {
  id?: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

interface GlobalParam {
  id?: string;
  name: string;
  value: string;
  location: string;
  description: string;
  enabled: boolean;
}

interface Project {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  isPublic: boolean;
  environments: Environment[];
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
}

interface ProjectSettingsProps {
  project: Project;
  onSave: (data: Partial<Project>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettings({
  project,
  onSave,
  open,
  onOpenChange,
}: ProjectSettingsProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [baseUrl, setBaseUrl] = useState(project.baseUrl);
  const [isPublic, setIsPublic] = useState(project.isPublic);
  const [environments, setEnvironments] = useState<Environment[]>(
    project.environments
  );
  const [globalHeaders, setGlobalHeaders] = useState<GlobalHeader[]>(
    project.globalHeaders
  );
  const [globalParams, setGlobalParams] = useState<GlobalParam[]>(
    project.globalParams
  );

  const handleSave = () => {
    onSave({
      name,
      description,
      baseUrl,
      isPublic,
      environments,
      globalHeaders,
      globalParams,
    });
  };

  const addEnvironment = () => {
    setEnvironments((prev) => [
      ...prev,
      { name: "", baseUrl: "", variables: "{}" },
    ]);
  };

  const updateEnvironment = (
    index: number,
    field: keyof Environment,
    value: string
  ) => {
    setEnvironments((prev) =>
      prev.map((env, i) => (i === index ? { ...env, [field]: value } : env))
    );
  };

  const removeEnvironment = (index: number) => {
    setEnvironments((prev) => prev.filter((_, i) => i !== index));
  };

  const addHeader = () => {
    setGlobalHeaders((prev) => [
      ...prev,
      { key: "", value: "", description: "", enabled: true },
    ]);
  };

  const updateHeader = (
    index: number,
    field: keyof GlobalHeader,
    value: string | boolean
  ) => {
    setGlobalHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    );
  };

  const removeHeader = (index: number) => {
    setGlobalHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const addParam = () => {
    setGlobalParams((prev) => [
      ...prev,
      { name: "", value: "", location: "query", description: "", enabled: true },
    ]);
  };

  const updateParam = (
    index: number,
    field: keyof GlobalParam,
    value: string | boolean
  ) => {
    setGlobalParams((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeParam = (index: number) => {
    setGlobalParams((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>项目设置</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="environments">环境</TabsTrigger>
            <TabsTrigger value="headers">全局请求头</TabsTrigger>
            <TabsTrigger value="params">全局参数</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                项目名称
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">描述</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                基础 URL
              </label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                可见性
              </label>
              <Select
                value={isPublic ? "public" : "private"}
                onValueChange={(v) => setIsPublic(v === "public")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">公开</SelectItem>
                  <SelectItem value="private">私有</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="environments" className="space-y-4">
            {environments.map((env, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="环境名称"
                    value={env.name}
                    onChange={(e) => updateEnvironment(i, "name", e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEnvironment(i)}
                  >
                    删除
                  </Button>
                </div>
                <Input
                  placeholder="基础 URL"
                  value={env.baseUrl}
                  onChange={(e) =>
                    updateEnvironment(i, "baseUrl", e.target.value)
                  }
                />
                <Textarea
                  placeholder='变量 JSON，如 {"token": "xxx"}'
                  value={env.variables}
                  onChange={(e) =>
                    updateEnvironment(i, "variables", e.target.value)
                  }
                  rows={2}
                  className="font-mono text-xs"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEnvironment}>
              添加环境
            </Button>
          </TabsContent>

          <TabsContent value="headers" className="space-y-3">
            {globalHeaders.map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Key"
                      value={h.key}
                      onChange={(e) => updateHeader(i, "key", e.target.value)}
                    />
                    <Input
                      placeholder="Value"
                      value={h.value}
                      onChange={(e) => updateHeader(i, "value", e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="描述"
                    value={h.description}
                    onChange={(e) =>
                      updateHeader(i, "description", e.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col items-center gap-1 pt-1">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={(e) =>
                        updateHeader(i, "enabled", e.target.checked)
                      }
                      className="rounded"
                    />
                    启用
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHeader(i)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addHeader}>
              添加请求头
            </Button>
          </TabsContent>

          <TabsContent value="params" className="space-y-3">
            {globalParams.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="参数名"
                      value={p.name}
                      onChange={(e) => updateParam(i, "name", e.target.value)}
                    />
                    <Input
                      placeholder="值"
                      value={p.value}
                      onChange={(e) => updateParam(i, "value", e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select
                      value={p.location}
                      onValueChange={(v) => updateParam(i, "location", v)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="query">Query</SelectItem>
                        <SelectItem value="header">Header</SelectItem>
                        <SelectItem value="path">Path</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="描述"
                      value={p.description}
                      onChange={(e) =>
                        updateParam(i, "description", e.target.value)
                      }
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 pt-1">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) =>
                        updateParam(i, "enabled", e.target.checked)
                      }
                      className="rounded"
                    />
                    启用
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeParam(i)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addParam}>
              添加参数
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
