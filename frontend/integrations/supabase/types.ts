export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      allergies: {
        Row: {
          allergy_type: string | null
          clinic_id: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          reaction: string | null
          severity: string | null
          substance: string
        }
        Insert: {
          allergy_type?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          reaction?: string | null
          severity?: string | null
          substance: string
        }
        Update: {
          allergy_type?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          severity?: string | null
          substance?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergies_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_status: Database["public"]["Enums"]["appointment_status"]
          arrived_at: string | null
          clinic_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          dentist_id: string | null
          end_time: string | null
          engaged_at: string | null
          flow_status: Database["public"]["Enums"]["flow_status"]
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_status?: Database["public"]["Enums"]["appointment_status"]
          arrived_at?: string | null
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dentist_id?: string | null
          end_time?: string | null
          engaged_at?: string | null
          flow_status?: Database["public"]["Enums"]["flow_status"]
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_status?: Database["public"]["Enums"]["appointment_status"]
          arrived_at?: string | null
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          dentist_id?: string | null
          end_time?: string | null
          engaged_at?: string | null
          flow_status?: Database["public"]["Enums"]["flow_status"]
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          clinic_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          clinic_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          clinic_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plans: {
        Row: {
          clinic_id: string
          created_at: string
          duration: string | null
          id: string
          interval_months: number | null
          name: string
          next_due_date: string | null
          patient_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          duration?: string | null
          id?: string
          interval_months?: number | null
          name: string
          next_due_date?: string | null
          patient_id: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          duration?: string | null
          id?: string
          interval_months?: number | null
          name?: string
          next_due_date?: string | null
          patient_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string
          patient_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          patient_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_counters: {
        Row: {
          clinic_id: string
          last_value: number
          prefix: string
        }
        Insert: {
          clinic_id: string
          last_value?: number
          prefix: string
        }
        Update: {
          clinic_id?: string
          last_value?: number
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_counters_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          patient_code_prefix: string
          phone: string | null
          tax_enabled: boolean
          tax_label: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          patient_code_prefix?: string
          phone?: string | null
          tax_enabled?: boolean
          tax_label?: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          patient_code_prefix?: string
          phone?: string | null
          tax_enabled?: boolean
          tax_label?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          notes: string | null
          patient_id: string
          reason: string
          status: Database["public"]["Enums"]["follow_up_status"]
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          notes?: string | null
          patient_id: string
          reason: string
          status?: Database["public"]["Enums"]["follow_up_status"]
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["follow_up_status"]
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_plans: {
        Row: {
          clinic_id: string
          created_at: string
          down_payment: number
          id: string
          installment_amount: number
          invoice_id: string
          number_of_installments: number
          start_date: string
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          down_payment?: number
          id?: string
          installment_amount?: number
          invoice_id: string
          number_of_installments: number
          start_date?: string
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          down_payment?: number
          id?: string
          installment_amount?: number
          invoice_id?: string
          number_of_installments?: number
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          due_date: string
          id: string
          installment_plan_id: string
          paid_amount: number
          paid_at: string | null
          status: Database["public"]["Enums"]["installment_status"]
        }
        Insert: {
          amount: number
          clinic_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_plan_id: string
          paid_amount?: number
          paid_at?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_plan_id?: string
          paid_amount?: number
          paid_at?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "installments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_installment_plan_id_fkey"
            columns: ["installment_plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          tax_rate: number
          treatment_id: string | null
          unit_price: number
        }
        Insert: {
          amount?: number
          clinic_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          tax_rate?: number
          treatment_id?: string | null
          unit_price?: number
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          tax_rate?: number
          treatment_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_amount: number
          clinic_id: string
          created_at: string
          created_by: string | null
          grand_total: number
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_amount: number
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          balance_amount?: number
          clinic_id: string
          created_at?: string
          created_by?: string | null
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          balance_amount?: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_conditions: {
        Row: {
          category: string | null
          clinic_id: string
          condition: string
          created_at: string
          id: string
          notes: string | null
          patient_id: string
        }
        Insert: {
          category?: string | null
          clinic_id: string
          condition: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
        }
        Update: {
          category?: string | null
          clinic_id?: string
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_conditions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_conditions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          clinic_id: string
          created_at: string
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          medication: string
          notes: string | null
          patient_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          medication: string
          notes?: string | null
          patient_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          medication?: string
          notes?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      motivation_acknowledgements: {
        Row: {
          ack_date: string
          created_at: string
          id: string
          quote_id: string | null
          user_id: string
        }
        Insert: {
          ack_date?: string
          created_at?: string
          id?: string
          quote_id?: string | null
          user_id: string
        }
        Update: {
          ack_date?: string
          created_at?: string
          id?: string
          quote_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motivation_acknowledgements_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "motivation_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      motivation_quotes: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          quote: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          quote: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          quote?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motivation_quotes_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      online_appointment_requests: {
        Row: {
          clinic_id: string
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string
          patient_id: string | null
          phone: string
          reason: string | null
          requested_date: string | null
          requested_time: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name: string
          patient_id?: string | null
          phone: string
          reason?: string | null
          requested_date?: string | null
          requested_time?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          patient_id?: string | null
          phone?: string
          reason?: string | null
          requested_date?: string | null
          requested_time?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_appointment_requests_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_appointment_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_habits: {
        Row: {
          clinic_id: string
          created_at: string
          habit: string
          id: string
          notes: string | null
          patient_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          habit: string
          id?: string
          notes?: string | null
          patient_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          habit?: string
          id?: string
          notes?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_habits_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_habits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact: string | null
          full_name: string
          gender: string | null
          id: string
          patient_code: string
          patient_type: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: string | null
          full_name: string
          gender?: string | null
          id?: string
          patient_code: string
          patient_type?: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          patient_code?: string
          patient_type?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          patient_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          clinic_id: string
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          patient_id: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          patient_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          clinic_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          clinic_id: string
          created_at?: string
          email?: string | null
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          clinic_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_catalogue: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          default_cost: number
          id: string
          name: string
          quick_entry: boolean
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          default_cost?: number
          id?: string
          name: string
          quick_entry?: boolean
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          default_cost?: number
          id?: string
          name?: string
          quick_entry?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "treatment_catalogue_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          clinic_id: string
          cost: number
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["treatment_status"]
          tooth_number: string | null
          treatment_date: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          clinic_id: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["treatment_status"]
          tooth_number?: string | null
          treatment_date?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          clinic_id?: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["treatment_status"]
          tooth_number?: string | null
          treatment_date?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          appointment_id: string | null
          chief_complaint: string | null
          clinic_id: string
          clinical_notes: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string | null
          doctor_notes: string | null
          id: string
          patient_id: string
          post_care_instructions: string | null
          reason: string | null
          treatment_performed: string | null
          updated_at: string
          visit_date: string
        }
        Insert: {
          appointment_id?: string | null
          chief_complaint?: string | null
          clinic_id: string
          clinical_notes?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string | null
          doctor_notes?: string | null
          id?: string
          patient_id: string
          post_care_instructions?: string | null
          reason?: string | null
          treatment_performed?: string | null
          updated_at?: string
          visit_date?: string
        }
        Update: {
          appointment_id?: string | null
          chief_complaint?: string | null
          clinic_id?: string
          clinical_notes?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string | null
          doctor_notes?: string | null
          id?: string
          patient_id?: string
          post_care_instructions?: string | null
          reason?: string | null
          treatment_performed?: string | null
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          active: boolean
          category: string
          clinic_id: string
          created_at: string
          id: string
          message: string
          name: string
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          clinic_id: string
          created_at?: string
          id?: string
          message: string
          name: string
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          clinic_id?: string
          created_at?: string
          id?: string
          message?: string
          name?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_clinic_id: { Args: never; Returns: string }
      ensure_auth_user_clinic: { Args: never; Returns: Json }
      ensure_self_admin: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      next_patient_code: { Args: { _prefix?: string }; Returns: string }
      record_invoice_payment: {
        Args: {
          _invoice_id: string
          _patient_id: string
          _amount: number
          _payment_method: string
          _payment_date: string
          _reference?: string | null
          _notes?: string | null
          _target_installment?: Json | null
          _skip_audit?: boolean
        }
        Returns: Json
      }
      save_new_patient: {
        Args: {
          _full_name: string
          _phone: string
          _email?: string | null
          _date_of_birth?: string | null
          _gender?: string | null
          _address?: string | null
          _emergency_contact?: string | null
          _patient_type?: string | null
          _conditions?: Json
          _allergies?: Json
          _medications?: Json
          _habits?: Json
          _case_note?: string | null
        }
        Returns: Json
      }
      save_quick_entry: {
        Args: {
          _full_name: string
          _phone: string
          _gender: string
          _conditions?: Json
          _allergies?: Json
          _medications?: Json
          _habits?: Json
          _doctor_notes?: string | null
          _clinical_notes?: string | null
          _treatment_label?: string | null
          _treatments?: Json
          _invoice_items?: Json
          _payment_amount?: number
          _payment_method?: string
          _visit_date?: string
        }
        Returns: Json
      }
      replace_patient_medical_profile: {
        Args: {
          p_patient_id: string
          p_conditions?: Json
          p_allergies?: Json
          p_medications?: Json
          p_habits?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "dentist" | "receptionist"
      appointment_status: "scheduled" | "confirmed" | "cancelled" | "no_show"
      flow_status: "schedule" | "waiting" | "engage" | "done"
      follow_up_status: "pending" | "scheduled" | "completed" | "overdue"
      installment_status: "pending" | "partial" | "paid" | "overdue"
      invoice_status: "draft" | "unpaid" | "partial" | "paid" | "cancelled"
      payment_method: "cash" | "card" | "upi" | "bank_transfer" | "other"
      request_status: "requested" | "confirmed" | "rescheduled" | "rejected"
      treatment_status: "planned" | "in_progress" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "dentist", "receptionist"],
      appointment_status: ["scheduled", "confirmed", "cancelled", "no_show"],
      flow_status: ["schedule", "waiting", "engage", "done"],
      follow_up_status: ["pending", "scheduled", "completed", "overdue"],
      installment_status: ["pending", "partial", "paid", "overdue"],
      invoice_status: ["draft", "unpaid", "partial", "paid", "cancelled"],
      payment_method: ["cash", "card", "upi", "bank_transfer", "other"],
      request_status: ["requested", "confirmed", "rescheduled", "rejected"],
      treatment_status: ["planned", "in_progress", "completed", "cancelled"],
    },
  },
} as const
