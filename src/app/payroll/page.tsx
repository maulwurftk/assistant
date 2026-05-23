import { redirect } from 'next/navigation'

export default function PayrollIndex() {
  const now = new Date()
  redirect(`/payroll/${now.getFullYear()}/${now.getMonth() + 1}`)
}
