"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-foreground">
        {title}
      </h2>
      <div className="rounded-[18px] border border-[#eeeee9] bg-white p-5 shadow-xs">{children}</div>
    </section>
  );
}

export default function DesignPage() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <main className="min-h-dvh bg-[#f5f6f2] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-8 rounded-[20px] border border-[#eeeee9] bg-[#fdfdfa] p-5 shadow-xs sm:p-8">
      <header className="rounded-[20px] border border-[#dfe9dc] bg-[#e8f1e6] p-6 sm:p-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-foreground">
          GazeEdu Design System
        </h1>
        <p className="text-sm text-muted-foreground">
          Thư viện thành phần giao diện mới — sáng, hiện đại, nhất quán.
        </p>
      </header>

      <Section title="Màu sắc">
        <div className="flex flex-wrap gap-3">
          {[
            ["Primary", "bg-primary"],
            ["Ink", "bg-brand-cyan"],
            ["Charcoal", "bg-brand-navy"],
            ["Success", "bg-success"],
            ["Warning", "bg-warning"],
            ["Destructive", "bg-destructive"],
            ["Muted", "bg-muted"],
            ["Accent", "bg-accent"],
          ].map(([label, cls]) => (
            <div key={label} className="space-y-1.5">
              <div className={`size-16 rounded-lg border border-border ${cls}`} />
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold">Heading 3xl</p>
          <p className="font-[family-name:var(--font-heading)] text-xl font-semibold">Heading xl</p>
          <p className="text-base">Body text thường dùng cho nội dung.</p>
          <p className="text-sm text-muted-foreground">Muted text cho mô tả phụ.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Mặc định</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Thêm">
            <Icon name="ri-add-line" />
          </Button>
          <Button disabled>
            <Spinner /> Đang lưu
          </Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">Đã xuất bản</Badge>
          <Badge variant="warning">Nháp</Badge>
          <Badge variant="destructive">Lỗi</Badge>
          <Badge variant="info">Thông tin</Badge>
        </div>
      </Section>

      <Section title="Form">
        <div className="grid max-w-md gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ds-email">Email</Label>
            <Input id="ds-email" type="email" placeholder="ban@truong.edu.vn" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-notes">Ghi chú</Label>
            <Textarea id="ds-notes" placeholder="Nhập mô tả..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-invalid">Trường lỗi</Label>
            <Input id="ds-invalid" aria-invalid defaultValue="giá trị sai" />
            <p className="text-xs text-destructive">Giá trị không hợp lệ.</p>
          </div>
        </div>
      </Section>

      <Section title="Alerts">
        <div className="space-y-3">
          <Alert variant="info" title="Thông tin">
            Camera của bạn đang hoạt động bình thường.
          </Alert>
          <Alert variant="success" title="Thành công">
            Đã lưu thay đổi khóa học.
          </Alert>
          <Alert variant="warning" title="Cảnh báo">
            Phiên calibration sắp hết hạn.
          </Alert>
          <Alert variant="destructive" title="Lỗi">
            Không thể kết nối tới dịch vụ eye-tracking.
          </Alert>
        </div>
      </Section>

      <Section title="Card & Progress">
        <Card className="max-w-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Giải tích cơ bản</CardTitle>
              <Badge variant="success">Đã xuất bản</Badge>
            </div>
            <CardDescription>12 bài học · 248 học viên</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tiến độ trung bình</span>
              <span className="font-semibold text-foreground">68%</span>
            </div>
            <Progress value={68} />
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" className="w-full">
              Mở workspace
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Avatar">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>NG</AvatarFallback>
          </Avatar>
          <Avatar className="size-12">
            <AvatarFallback>HV</AvatarFallback>
          </Avatar>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Nội dung</TabsTrigger>
            <TabsTrigger value="b">Học viên</TabsTrigger>
            <TabsTrigger value="c">Tổng quan</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-sm text-muted-foreground">
            Nội dung khóa học.
          </TabsContent>
          <TabsContent value="b" className="text-sm text-muted-foreground">
            Danh sách học viên.
          </TabsContent>
          <TabsContent value="c" className="text-sm text-muted-foreground">
            Tổng quan phân tích.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Loading & Skeleton">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-4 w-64" />
          <Spinner className="text-primary" />
        </div>
      </Section>

      <Section title="Empty & Error">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon="ri-inbox-line"
            title="Chưa có khóa học"
            description="Bắt đầu bằng cách tạo khóa học đầu tiên."
            action={<Button size="sm">Tạo khóa học</Button>}
          />
          <ErrorState onRetry={() => {}} />
        </div>
      </Section>

      <Section title="Dialog">
        <Button onClick={() => setConfirmOpen(true)}>Mở confirm</Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Gỡ học viên khỏi khóa học?"
          description="Học viên sẽ mất quyền truy cập nội dung cho tới khi được thêm lại."
          confirmLabel="Gỡ"
          destructive
          onConfirm={() => setConfirmOpen(false)}
        />
      </Section>
      </div>
    </main>
  );
}
