import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendTestPush } from '@/lib/push'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await sendTestPush(user.id)
  return NextResponse.json(result)
}
