'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TemplatesTab } from './TemplatesTab'
import { OneOffTab } from './OneOffTab'
import { MonitoringTab } from './MonitoringTab'

export function AdminAufgabenTabs() {
  return (
    <Tabs defaultValue="vorlagen">
      <TabsList>
        <TabsTrigger value="vorlagen">Vorlagen</TabsTrigger>
        <TabsTrigger value="einmalaufgaben">Einmalaufgaben</TabsTrigger>
        <TabsTrigger value="ueberwachung">Überwachung</TabsTrigger>
      </TabsList>
      <TabsContent value="vorlagen" className="pt-4">
        <TemplatesTab />
      </TabsContent>
      <TabsContent value="einmalaufgaben" className="pt-4">
        <OneOffTab />
      </TabsContent>
      <TabsContent value="ueberwachung" className="pt-4">
        <MonitoringTab />
      </TabsContent>
    </Tabs>
  )
}
