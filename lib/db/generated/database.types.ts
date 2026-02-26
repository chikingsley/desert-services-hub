export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          contact_count: number | null
          created_at: string | null
          domain: string | null
          email_count: number | null
          id: number
          monday_account_id: string | null
          monday_name: string | null
          name: string
          pdl_enriched_at: string | null
          pdl_enrichment: Json | null
          ssm_assignment: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          contact_count?: number | null
          created_at?: string | null
          domain?: string | null
          email_count?: number | null
          id?: number
          monday_account_id?: string | null
          monday_name?: string | null
          name: string
          pdl_enriched_at?: string | null
          pdl_enrichment?: Json | null
          ssm_assignment?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_count?: number | null
          created_at?: string | null
          domain?: string | null
          email_count?: number | null
          id?: number
          monday_account_id?: string | null
          monday_name?: string | null
          name?: string
          pdl_enriched_at?: string | null
          pdl_enrichment?: Json | null
          ssm_assignment?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      aqdata_permits: {
        Row: {
          address: string | null
          city: string | null
          closed_date: string | null
          company_id: string | null
          company_name: string | null
          detail_fields: Json | null
          detail_html: string | null
          detail_scraped_at: string | null
          effective_date: string | null
          expiration_date: string | null
          exported_at: string
          facility_id: string | null
          facility_name: string | null
          id: string
          invoice_balance: number | null
          invoice_charges: number | null
          invoice_number: string | null
          is_accelerated: boolean
          is_block_permit: boolean
          parcel: string | null
          previous_app_id: string | null
          project_completion_date: string | null
          project_name: string | null
          project_start_date: string | null
          raw_export: Json
          status: string | null
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          closed_date?: string | null
          company_id?: string | null
          company_name?: string | null
          detail_fields?: Json | null
          detail_html?: string | null
          detail_scraped_at?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          exported_at?: string
          facility_id?: string | null
          facility_name?: string | null
          id: string
          invoice_balance?: number | null
          invoice_charges?: number | null
          invoice_number?: string | null
          is_accelerated?: boolean
          is_block_permit?: boolean
          parcel?: string | null
          previous_app_id?: string | null
          project_completion_date?: string | null
          project_name?: string | null
          project_start_date?: string | null
          raw_export?: Json
          status?: string | null
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          closed_date?: string | null
          company_id?: string | null
          company_name?: string | null
          detail_fields?: Json | null
          detail_html?: string | null
          detail_scraped_at?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          exported_at?: string
          facility_id?: string | null
          facility_name?: string | null
          id?: string
          invoice_balance?: number | null
          invoice_charges?: number | null
          invoice_number?: string | null
          is_accelerated?: boolean
          is_block_permit?: boolean
          parcel?: string | null
          previous_app_id?: string | null
          project_completion_date?: string | null
          project_name?: string | null
          project_start_date?: string | null
          raw_export?: Json
          status?: string | null
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      background_worker_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      body_link_manual_followups: {
        Row: {
          created_at: string
          email_id: number
          first_seen_at: string
          id: number
          last_seen_at: string
          mailbox_email: string
          note: string | null
          occurrences: number
          reason: string
          resolved_at: string | null
          source: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          email_id: number
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          mailbox_email: string
          note?: string | null
          occurrences?: number
          reason: string
          resolved_at?: string | null
          source: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          email_id?: number
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          mailbox_email?: string
          note?: string | null
          occurrences?: number
          reason?: string
          resolved_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_link_manual_followups_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_list_dedup_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_link_manual_followups_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_link_manual_followups_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "project_email_dedup_mv"
            referencedColumns: ["canonical_email_id"]
          },
        ]
      }
      company_aliases: {
        Row: {
          account_id: number
          alias: string
          created_at: string | null
          id: number
        }
        Insert: {
          account_id: number
          alias: string
          created_at?: string | null
          id?: number
        }
        Update: {
          account_id?: number
          alias?: string
          created_at?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_emails: {
        Row: {
          contact_id: number
          created_at: string | null
          email_id: number
          id: number
          relationship: string
        }
        Insert: {
          contact_id: number
          created_at?: string | null
          email_id: number
          id?: number
          relationship: string
        }
        Update: {
          contact_id?: number
          created_at?: string | null
          email_id?: number
          id?: number
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_list_dedup_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "project_email_dedup_mv"
            referencedColumns: ["canonical_email_id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: number | null
          company_fax: string | null
          company_phone: string | null
          contact_type: string
          contractor_matched: string | null
          contractor_monday_id: string | null
          contractor_search_notes: string | null
          contractor_searched_at: string | null
          created_at: string | null
          department: string | null
          email: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          group_id: string | null
          group_title: string | null
          id: number
          imported_account_name: string | null
          imported_phone: string | null
          is_active: boolean
          last_verified_at: string | null
          mobile_phone: string | null
          monday_item_id: string
          name: string
          notes: string | null
          office_phone: string | null
          phone: string | null
          phone_matched: string | null
          priority: string | null
          project_monday_ids: string | null
          synced_at: string | null
          territory_owner: string | null
          title: string | null
          updated_at: string | null
          verification_source: string | null
        }
        Insert: {
          account_id?: number | null
          company_fax?: string | null
          company_phone?: string | null
          contact_type?: string
          contractor_matched?: string | null
          contractor_monday_id?: string | null
          contractor_search_notes?: string | null
          contractor_searched_at?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          group_id?: string | null
          group_title?: string | null
          id?: number
          imported_account_name?: string | null
          imported_phone?: string | null
          is_active?: boolean
          last_verified_at?: string | null
          mobile_phone?: string | null
          monday_item_id: string
          name: string
          notes?: string | null
          office_phone?: string | null
          phone?: string | null
          phone_matched?: string | null
          priority?: string | null
          project_monday_ids?: string | null
          synced_at?: string | null
          territory_owner?: string | null
          title?: string | null
          updated_at?: string | null
          verification_source?: string | null
        }
        Update: {
          account_id?: number | null
          company_fax?: string | null
          company_phone?: string | null
          contact_type?: string
          contractor_matched?: string | null
          contractor_monday_id?: string | null
          contractor_search_notes?: string | null
          contractor_searched_at?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          group_id?: string | null
          group_title?: string | null
          id?: number
          imported_account_name?: string | null
          imported_phone?: string | null
          is_active?: boolean
          last_verified_at?: string | null
          mobile_phone?: string | null
          monday_item_id?: string
          name?: string
          notes?: string | null
          office_phone?: string | null
          phone?: string | null
          phone_matched?: string | null
          priority?: string | null
          project_monday_ids?: string | null
          synced_at?: string | null
          territory_owner?: string | null
          title?: string | null
          updated_at?: string | null
          verification_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_packet_documents: {
        Row: {
          created_at: string
          document_id: number
          document_role: string
          id: number
          is_required: boolean
          packet_id: number
        }
        Insert: {
          created_at?: string
          document_id: number
          document_role?: string
          id?: number
          is_required?: boolean
          packet_id: number
        }
        Update: {
          created_at?: string
          document_id?: number
          document_role?: string
          id?: number
          is_required?: boolean
          packet_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_packet_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packet_documents_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "contract_packet_queue_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packet_documents_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "contract_packets"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_packets: {
        Row: {
          counterparty_responded_at: string | null
          counterparty_response_due_at: string | null
          created_at: string
          estimate_id: number | null
          executed_at: string | null
          id: number
          is_active: boolean
          metadata: Json
          next_action: string | null
          notes: string | null
          owner: string | null
          packet_type: string
          project_id: number
          received_at: string | null
          requested_at: string | null
          sent_back_at: string | null
          sla_minutes: number | null
          source_email_id: number | null
          status: string
          triage_completed_at: string | null
          triage_started_at: string | null
          updated_at: string
        }
        Insert: {
          counterparty_responded_at?: string | null
          counterparty_response_due_at?: string | null
          created_at?: string
          estimate_id?: number | null
          executed_at?: string | null
          id?: number
          is_active?: boolean
          metadata?: Json
          next_action?: string | null
          notes?: string | null
          owner?: string | null
          packet_type?: string
          project_id: number
          received_at?: string | null
          requested_at?: string | null
          sent_back_at?: string | null
          sla_minutes?: number | null
          source_email_id?: number | null
          status?: string
          triage_completed_at?: string | null
          triage_started_at?: string | null
          updated_at?: string
        }
        Update: {
          counterparty_responded_at?: string | null
          counterparty_response_due_at?: string | null
          created_at?: string
          estimate_id?: number | null
          executed_at?: string | null
          id?: number
          is_active?: boolean
          metadata?: Json
          next_action?: string | null
          notes?: string | null
          owner?: string | null
          packet_type?: string
          project_id?: number
          received_at?: string | null
          requested_at?: string | null
          sent_back_at?: string | null
          sla_minutes?: number | null
          source_email_id?: number | null
          status?: string
          triage_completed_at?: string | null
          triage_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_packets_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "contract_packets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "email_list_dedup_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "project_email_dedup_mv"
            referencedColumns: ["canonical_email_id"]
          },
        ]
      }
      documents: {
        Row: {
          content_hash: string | null
          content_type: string | null
          created_at: string | null
          document_type: string
          downloaded_at: string | null
          email_id: number | null
          estimate_id: number | null
          extracted_at: string | null
          extracted_text: string | null
          extraction_attempts: number | null
          extraction_error: string | null
          extraction_status: string
          file_extension: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          forwarder_email: string | null
          id: number
          last_attempted_at: string | null
          local_path: string | null
          model: string | null
          monday_asset_id: string | null
          monday_column_id: string | null
          monday_item_id: string | null
          original_from: string | null
          original_subject: string | null
          outlook_attachment_id: string | null
          permit_id: string | null
          processing_time_ms: number | null
          project_id: number | null
          raw_extraction: Json | null
          search_vector: unknown
          source: string | null
          storage_bucket: string | null
          storage_path: string | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string | null
          document_type?: string
          downloaded_at?: string | null
          email_id?: number | null
          estimate_id?: number | null
          extracted_at?: string | null
          extracted_text?: string | null
          extraction_attempts?: number | null
          extraction_error?: string | null
          extraction_status?: string
          file_extension?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          forwarder_email?: string | null
          id?: number
          last_attempted_at?: string | null
          local_path?: string | null
          model?: string | null
          monday_asset_id?: string | null
          monday_column_id?: string | null
          monday_item_id?: string | null
          original_from?: string | null
          original_subject?: string | null
          outlook_attachment_id?: string | null
          permit_id?: string | null
          processing_time_ms?: number | null
          project_id?: number | null
          raw_extraction?: Json | null
          search_vector?: unknown
          source?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string | null
          document_type?: string
          downloaded_at?: string | null
          email_id?: number | null
          estimate_id?: number | null
          extracted_at?: string | null
          extracted_text?: string | null
          extraction_attempts?: number | null
          extraction_error?: string | null
          extraction_status?: string
          file_extension?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          forwarder_email?: string | null
          id?: number
          last_attempted_at?: string | null
          local_path?: string | null
          model?: string | null
          monday_asset_id?: string | null
          monday_column_id?: string | null
          monday_item_id?: string | null
          original_from?: string | null
          original_subject?: string | null
          outlook_attachment_id?: string | null
          permit_id?: string | null
          processing_time_ms?: number | null
          project_id?: number | null
          raw_extraction?: Json | null
          search_vector?: unknown
          source?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_list_dedup_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "project_email_dedup_mv"
            referencedColumns: ["canonical_email_id"]
          },
          {
            foreignKeyName: "documents_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "dust_permits_filed_by_desert_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_rules: {
        Row: {
          classification: string | null
          created_at: string | null
          domain: string
          id: number
          is_excluded: boolean
        }
        Insert: {
          classification?: string | null
          created_at?: string | null
          domain: string
          id?: number
          is_excluded?: boolean
        }
        Update: {
          classification?: string | null
          created_at?: string | null
          domain?: string
          id?: number
          is_excluded?: boolean
        }
        Relationships: []
      }
      dust_permits_filed_by_desert_services: {
        Row: {
          account_id: number | null
          address: string | null
          city: string | null
          closed_date: string | null
          company_name: string | null
          created_at: number | null
          effective_date: string | null
          expiration_date: string | null
          facility_id: string | null
          id: string
          invoice_balance: number | null
          invoice_charges: number | null
          invoice_number: string | null
          is_accelerated: number | null
          is_block_permit: number | null
          parcel: string | null
          portal_company_id: string | null
          previous_app_id: string | null
          project_end_date: string | null
          project_id: number | null
          project_name: string | null
          project_start_date: string | null
          search_vector: unknown
          status: string | null
          submitted_date: string | null
          updated_at: number | null
        }
        Insert: {
          account_id?: number | null
          address?: string | null
          city?: string | null
          closed_date?: string | null
          company_name?: string | null
          created_at?: number | null
          effective_date?: string | null
          expiration_date?: string | null
          facility_id?: string | null
          id: string
          invoice_balance?: number | null
          invoice_charges?: number | null
          invoice_number?: string | null
          is_accelerated?: number | null
          is_block_permit?: number | null
          parcel?: string | null
          portal_company_id?: string | null
          previous_app_id?: string | null
          project_end_date?: string | null
          project_id?: number | null
          project_name?: string | null
          project_start_date?: string | null
          search_vector?: unknown
          status?: string | null
          submitted_date?: string | null
          updated_at?: number | null
        }
        Update: {
          account_id?: number | null
          address?: string | null
          city?: string | null
          closed_date?: string | null
          company_name?: string | null
          created_at?: number | null
          effective_date?: string | null
          expiration_date?: string | null
          facility_id?: string | null
          id?: string
          invoice_balance?: number | null
          invoice_charges?: number | null
          invoice_number?: string | null
          is_accelerated?: number | null
          is_block_permit?: number | null
          parcel?: string | null
          portal_company_id?: string | null
          previous_app_id?: string | null
          project_end_date?: string | null
          project_id?: number | null
          project_name?: string | null
          project_start_date?: string | null
          search_vector?: unknown
          status?: string | null
          submitted_date?: string | null
          updated_at?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dust_permits_filed_by_desert_services_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dust_permits_filed_by_desert_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "dust_permits_filed_by_desert_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          account_id: number | null
          attachment_names: string | null
          body_full: string | null
          body_html: string | null
          body_link_scan_attachments_added: number | null
          body_link_scan_attempts: number | null
          body_link_scan_error: string | null
          body_link_scan_links_found: number | null
          body_link_scan_status: string | null
          body_link_scan_version: number | null
          body_link_scanned_at: string | null
          body_preview: string | null
          categories: string | null
          cc_emails: string | null
          classification: string | null
          classification_confidence: number | null
          classification_method: string | null
          contractor_name: string | null
          conversation_id: string | null
          created_at: string | null
          from_domain: string | null
          from_email: string | null
          from_name: string | null
          has_attachments: number | null
          id: number
          internet_message_id: string | null
          is_excluded: number | null
          is_forwarded: number | null
          is_internal: number | null
          is_platform_email: number | null
          mailbox_id: number
          message_id: string
          monday_estimate_id: string | null
          normalized_subject: string | null
          notion_project_id: string | null
          original_sender_domain: string | null
          original_sender_email: string | null
          platform_name: string | null
          project_id: number | null
          project_name: string | null
          real_sender_company: string | null
          real_sender_domain: string | null
          real_sender_email: string | null
          real_sender_name: string | null
          received_at: string
          search_vector: unknown
          subject: string | null
          thread_id: string | null
          to_emails: string | null
          web_url: string | null
        }
        Insert: {
          account_id?: number | null
          attachment_names?: string | null
          body_full?: string | null
          body_html?: string | null
          body_link_scan_attachments_added?: number | null
          body_link_scan_attempts?: number | null
          body_link_scan_error?: string | null
          body_link_scan_links_found?: number | null
          body_link_scan_status?: string | null
          body_link_scan_version?: number | null
          body_link_scanned_at?: string | null
          body_preview?: string | null
          categories?: string | null
          cc_emails?: string | null
          classification?: string | null
          classification_confidence?: number | null
          classification_method?: string | null
          contractor_name?: string | null
          conversation_id?: string | null
          created_at?: string | null
          from_domain?: string | null
          from_email?: string | null
          from_name?: string | null
          has_attachments?: number | null
          id?: number
          internet_message_id?: string | null
          is_excluded?: number | null
          is_forwarded?: number | null
          is_internal?: number | null
          is_platform_email?: number | null
          mailbox_id: number
          message_id: string
          monday_estimate_id?: string | null
          normalized_subject?: string | null
          notion_project_id?: string | null
          original_sender_domain?: string | null
          original_sender_email?: string | null
          platform_name?: string | null
          project_id?: number | null
          project_name?: string | null
          real_sender_company?: string | null
          real_sender_domain?: string | null
          real_sender_email?: string | null
          real_sender_name?: string | null
          received_at: string
          search_vector?: unknown
          subject?: string | null
          thread_id?: string | null
          to_emails?: string | null
          web_url?: string | null
        }
        Update: {
          account_id?: number | null
          attachment_names?: string | null
          body_full?: string | null
          body_html?: string | null
          body_link_scan_attachments_added?: number | null
          body_link_scan_attempts?: number | null
          body_link_scan_error?: string | null
          body_link_scan_links_found?: number | null
          body_link_scan_status?: string | null
          body_link_scan_version?: number | null
          body_link_scanned_at?: string | null
          body_preview?: string | null
          categories?: string | null
          cc_emails?: string | null
          classification?: string | null
          classification_confidence?: number | null
          classification_method?: string | null
          contractor_name?: string | null
          conversation_id?: string | null
          created_at?: string | null
          from_domain?: string | null
          from_email?: string | null
          from_name?: string | null
          has_attachments?: number | null
          id?: number
          internet_message_id?: string | null
          is_excluded?: number | null
          is_forwarded?: number | null
          is_internal?: number | null
          is_platform_email?: number | null
          mailbox_id?: number
          message_id?: string
          monday_estimate_id?: string | null
          normalized_subject?: string | null
          notion_project_id?: string | null
          original_sender_domain?: string | null
          original_sender_email?: string | null
          platform_name?: string | null
          project_id?: number | null
          project_name?: string | null
          real_sender_company?: string | null
          real_sender_domain?: string | null
          real_sender_email?: string | null
          real_sender_name?: string | null
          received_at?: string
          search_vector?: unknown
          subject?: string | null
          thread_id?: string | null
          to_emails?: string | null
          web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_contacts: {
        Row: {
          contact_id: number
          created_at: string | null
          estimate_id: number
          source: string
        }
        Insert: {
          contact_id: number
          created_at?: string | null
          estimate_id: number
          source?: string
        }
        Update: {
          contact_id?: number
          created_at?: string | null
          estimate_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_contacts_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_emails: {
        Row: {
          created_at: string | null
          email_id: number
          estimate_id: number
          id: number
          match_detail: string | null
          match_type: string
        }
        Insert: {
          created_at?: string | null
          email_id: number
          estimate_id: number
          id?: number
          match_detail?: string | null
          match_type: string
        }
        Update: {
          created_at?: string | null
          email_id?: number
          estimate_id?: number
          id?: number
          match_detail?: string | null
          match_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_list_dedup_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_emails_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "project_email_dedup_mv"
            referencedColumns: ["canonical_email_id"]
          },
          {
            foreignKeyName: "estimate_emails_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          is_excluded: number
          item_name: string | null
          notes: string | null
          quantity: number
          section_id: string | null
          sort_order: number
          unit: string
          unit_price: number
          updated_at: string | null
          version_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id: string
          is_excluded?: number
          item_name?: string | null
          notes?: string | null
          quantity?: number
          section_id?: string | null
          sort_order?: number
          unit?: string
          unit_price?: number
          updated_at?: string | null
          version_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          is_excluded?: number
          item_name?: string | null
          notes?: string | null
          quantity?: number
          section_id?: string | null
          sort_order?: number
          unit?: string
          unit_price?: number
          updated_at?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "estimate_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "estimate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_poller_events_archive: {
        Row: {
          archived_at: string
          created_at: string | null
          details: Json | null
          estimate_name: string | null
          event_type: string
          id: number
          monday_item_id: string | null
        }
        Insert: {
          archived_at?: string
          created_at?: string | null
          details?: Json | null
          estimate_name?: string | null
          event_type: string
          id: number
          monday_item_id?: string | null
        }
        Update: {
          archived_at?: string
          created_at?: string | null
          details?: Json | null
          estimate_name?: string | null
          event_type?: string
          id?: number
          monday_item_id?: string | null
        }
        Relationships: []
      }
      estimate_sections: {
        Row: {
          created_at: string | null
          id: string
          name: string
          show_subtotal: number
          sort_order: number
          title: string | null
          version_id: string
        }
        Insert: {
          created_at?: string | null
          id: string
          name: string
          show_subtotal?: number
          sort_order?: number
          title?: string | null
          version_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          show_subtotal?: number
          sort_order?: number
          title?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_sections_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "estimate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_versions: {
        Row: {
          created_at: string | null
          estimate_id: number
          id: string
          is_current: number
          source: string
          total: number
          version_number: number
        }
        Insert: {
          created_at?: string | null
          estimate_id: number
          id: string
          is_current?: number
          source?: string
          total?: number
          version_number?: number
        }
        Update: {
          created_at?: string | null
          estimate_id?: number
          id?: string
          is_current?: number
          source?: string
          total?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_versions_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          account_domain: string | null
          account_id: number | null
          account_monday_id: string | null
          awarded: number | null
          awarded_value: number | null
          base_number: string | null
          bid_source: string | null
          bid_status: string | null
          bid_value: number | null
          client_address: string | null
          contractor: string | null
          created_at: string | null
          due_date: string | null
          estimate_file_name: string | null
          estimate_number: string | null
          estimate_storage_path: string | null
          estimator: string | null
          estimator_email: string | null
          extracted_at: string | null
          extracted_estimator: string | null
          extracted_grand_total: number | null
          extracted_job_name: string | null
          extraction_error: string | null
          extraction_status: string | null
          group_id: string | null
          group_title: string | null
          id: number
          is_locked: number | null
          job_address: string | null
          job_name: string | null
          lat: number | null
          lng: number | null
          location: string | null
          monday_item_id: string | null
          monday_url: string | null
          name: string
          notes: string | null
          search_vector: unknown
          sharepoint_url: string | null
          status: string | null
          synced_at: string | null
          takeoff_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_domain?: string | null
          account_id?: number | null
          account_monday_id?: string | null
          awarded?: number | null
          awarded_value?: number | null
          base_number?: string | null
          bid_source?: string | null
          bid_status?: string | null
          bid_value?: number | null
          client_address?: string | null
          contractor?: string | null
          created_at?: string | null
          due_date?: string | null
          estimate_file_name?: string | null
          estimate_number?: string | null
          estimate_storage_path?: string | null
          estimator?: string | null
          estimator_email?: string | null
          extracted_at?: string | null
          extracted_estimator?: string | null
          extracted_grand_total?: number | null
          extracted_job_name?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          group_id?: string | null
          group_title?: string | null
          id?: number
          is_locked?: number | null
          job_address?: string | null
          job_name?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          monday_item_id?: string | null
          monday_url?: string | null
          name: string
          notes?: string | null
          search_vector?: unknown
          sharepoint_url?: string | null
          status?: string | null
          synced_at?: string | null
          takeoff_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_domain?: string | null
          account_id?: number | null
          account_monday_id?: string | null
          awarded?: number | null
          awarded_value?: number | null
          base_number?: string | null
          bid_source?: string | null
          bid_status?: string | null
          bid_value?: number | null
          client_address?: string | null
          contractor?: string | null
          created_at?: string | null
          due_date?: string | null
          estimate_file_name?: string | null
          estimate_number?: string | null
          estimate_storage_path?: string | null
          estimator?: string | null
          estimator_email?: string | null
          extracted_at?: string | null
          extracted_estimator?: string | null
          extracted_grand_total?: number | null
          extracted_job_name?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          group_id?: string | null
          group_title?: string | null
          id?: number
          is_locked?: number | null
          job_address?: string | null
          job_name?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          monday_item_id?: string | null
          monday_url?: string | null
          name?: string
          notes?: string | null
          search_vector?: unknown
          sharepoint_url?: string | null
          status?: string | null
          synced_at?: string | null
          takeoff_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_takeoff_id_fkey"
            columns: ["takeoff_id"]
            isOneToOne: false
            referencedRelation: "takeoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_watcher_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      folder_watcher_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          folder_id: string | null
          folder_name: string | null
          id: number
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          folder_id?: string | null
          folder_name?: string | null
          id?: number
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          folder_id?: string | null
          folder_name?: string | null
          id?: number
        }
        Relationships: []
      }
      mailboxes: {
        Row: {
          created_at: string | null
          delta_token: string | null
          display_name: string | null
          email: string
          email_count: number | null
          id: number
          last_sync_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delta_token?: string | null
          display_name?: string | null
          email: string
          email_count?: number | null
          id?: number
          last_sync_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delta_token?: string | null
          display_name?: string | null
          email?: string
          email_count?: number | null
          id?: number
          last_sync_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      marketing_permits: {
        Row: {
          address: string | null
          city: string | null
          closed_date: string | null
          company_id: string | null
          company_name: string | null
          created_at: number | null
          detail_scraped_at: number | null
          effective_date: string | null
          expiration_date: string | null
          id: string
          invoice_balance: number | null
          invoice_charges: number | null
          invoice_number: string | null
          is_accelerated: number | null
          is_block_permit: number | null
          parcel: string | null
          previous_app_id: string | null
          project_end_date: string | null
          project_name: string | null
          project_start_date: string | null
          raw_data: Json | null
          scraped_at: number | null
          status: string | null
          submitted_date: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          closed_date?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: number | null
          detail_scraped_at?: number | null
          effective_date?: string | null
          expiration_date?: string | null
          id: string
          invoice_balance?: number | null
          invoice_charges?: number | null
          invoice_number?: string | null
          is_accelerated?: number | null
          is_block_permit?: number | null
          parcel?: string | null
          previous_app_id?: string | null
          project_end_date?: string | null
          project_name?: string | null
          project_start_date?: string | null
          raw_data?: Json | null
          scraped_at?: number | null
          status?: string | null
          submitted_date?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          closed_date?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: number | null
          detail_scraped_at?: number | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          invoice_balance?: number | null
          invoice_charges?: number | null
          invoice_number?: string | null
          is_accelerated?: number | null
          is_block_permit?: number | null
          parcel?: string | null
          previous_app_id?: string | null
          project_end_date?: string | null
          project_name?: string | null
          project_start_date?: string | null
          raw_data?: Json | null
          scraped_at?: number | null
          status?: string | null
          submitted_date?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          draft_id: string | null
          error: string | null
          event_type: string
          id: number
          metadata: string | null
          ref_id: string | null
          ref_type: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string | null
          draft_id?: string | null
          error?: string | null
          event_type: string
          id?: number
          metadata?: string | null
          ref_id?: string | null
          ref_type?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string | null
          draft_id?: string | null
          error?: string | null
          event_type?: string
          id?: number
          metadata?: string | null
          ref_id?: string | null
          ref_type?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      outlook_subscriptions: {
        Row: {
          change_type: string
          client_state: string | null
          created_at: string | null
          expiration: string
          id: number
          mailbox_email: string
          mailbox_id: number
          renewed_at: string | null
          resource: string
          subscription_id: string
        }
        Insert: {
          change_type?: string
          client_state?: string | null
          created_at?: string | null
          expiration: string
          id?: number
          mailbox_email: string
          mailbox_id: number
          renewed_at?: string | null
          resource: string
          subscription_id: string
        }
        Update: {
          change_type?: string
          client_state?: string | null
          created_at?: string | null
          expiration?: string
          id?: number
          mailbox_email?: string
          mailbox_id?: number
          renewed_at?: string | null
          resource?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlook_subscriptions_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_aliases: {
        Row: {
          alias: string
          created_at: string | null
          id: number
          normalized_alias: string
          project_id: number
          source: string | null
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: number
          normalized_alias: string
          project_id: number
          source?: string | null
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: number
          normalized_alias?: string
          project_id?: number
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_aliases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_aliases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_estimates: {
        Row: {
          canonicalized_at: string | null
          created_at: string | null
          estimate_id: number
          is_canonical: boolean
          project_id: number
          source: string
        }
        Insert: {
          canonicalized_at?: string | null
          created_at?: string | null
          estimate_id: number
          is_canonical?: boolean
          project_id: number
          source?: string
        }
        Update: {
          canonicalized_at?: string | null
          created_at?: string | null
          estimate_id?: number
          is_canonical?: boolean
          project_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_estimates_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_match_reviews: {
        Row: {
          account_id_hint: number | null
          address_hint: string | null
          alias_hints: Json
          candidates: Json
          contractor_hint: string | null
          created_at: string
          decision: Json
          id: number
          note: string | null
          primary_text: string
          resolution_note: string | null
          resolved_at: string | null
          selected_project_id: number | null
          source: string
          source_key: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id_hint?: number | null
          address_hint?: string | null
          alias_hints?: Json
          candidates?: Json
          contractor_hint?: string | null
          created_at?: string
          decision?: Json
          id?: number
          note?: string | null
          primary_text: string
          resolution_note?: string | null
          resolved_at?: string | null
          selected_project_id?: number | null
          source: string
          source_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id_hint?: number | null
          address_hint?: string | null
          alias_hints?: Json
          candidates?: Json
          contractor_hint?: string | null
          created_at?: string
          decision?: Json
          id?: number
          note?: string | null
          primary_text?: string
          resolution_note?: string | null
          resolved_at?: string | null
          selected_project_id?: number | null
          source?: string
          source_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_match_reviews_account_id_hint_fkey"
            columns: ["account_id_hint"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_match_reviews_selected_project_id_fkey"
            columns: ["selected_project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_match_reviews_selected_project_id_fkey"
            columns: ["selected_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sov_master: {
        Row: {
          project_id: number
          snapshot_hash: string
          snapshot_json: Json
          source_estimate_id: number | null
          source_estimate_version_id: string | null
          source_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          project_id: number
          snapshot_hash: string
          snapshot_json?: Json
          source_estimate_id?: number | null
          source_estimate_version_id?: string | null
          source_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          project_id?: number
          snapshot_hash?: string
          snapshot_json?: Json
          source_estimate_id?: number | null
          source_estimate_version_id?: string | null
          source_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_sov_master_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sov_master_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sov_master_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sov_master_source_estimate_version_id_fkey"
            columns: ["source_estimate_version_id"]
            isOneToOne: false
            referencedRelation: "estimate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sov_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          project_id: number
          snapshot_hash: string
          snapshot_json: Json
          source_estimate_id: number | null
          source_estimate_version_id: string | null
          source_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          project_id: number
          snapshot_hash: string
          snapshot_json?: Json
          source_estimate_id?: number | null
          source_estimate_version_id?: string | null
          source_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          project_id?: number
          snapshot_hash?: string
          snapshot_json?: Json
          source_estimate_id?: number | null
          source_estimate_version_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sov_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_sov_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sov_revisions_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sov_revisions_source_estimate_version_id_fkey"
            columns: ["source_estimate_version_id"]
            isOneToOne: false
            referencedRelation: "estimate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: number | null
          address: string | null
          archived_at: string | null
          awarded_value: number | null
          contract_status: string | null
          contractor: string | null
          created_at: string | null
          dust_permit_status: string | null
          email_count: number | null
          first_seen: string | null
          id: number
          last_evidence_at: string | null
          last_seen: string | null
          lifecycle_state: string
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          lost_at: string | null
          monday_item_id: string | null
          name: string
          noi_status: string | null
          normalized_name: string | null
          notes: string | null
          outlook_folder: string | null
          project_number: string | null
          promoted_at: string | null
          search_vector: unknown
          seed_key: string | null
          seed_source: string | null
          signs_status: string | null
          swppp_status: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: number | null
          address?: string | null
          archived_at?: string | null
          awarded_value?: number | null
          contract_status?: string | null
          contractor?: string | null
          created_at?: string | null
          dust_permit_status?: string | null
          email_count?: number | null
          first_seen?: string | null
          id?: number
          last_evidence_at?: string | null
          last_seen?: string | null
          lifecycle_state?: string
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          lost_at?: string | null
          monday_item_id?: string | null
          name: string
          noi_status?: string | null
          normalized_name?: string | null
          notes?: string | null
          outlook_folder?: string | null
          project_number?: string | null
          promoted_at?: string | null
          search_vector?: unknown
          seed_key?: string | null
          seed_source?: string | null
          signs_status?: string | null
          swppp_status?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: number | null
          address?: string | null
          archived_at?: string | null
          awarded_value?: number | null
          contract_status?: string | null
          contractor?: string | null
          created_at?: string | null
          dust_permit_status?: string | null
          email_count?: number | null
          first_seen?: string | null
          id?: number
          last_evidence_at?: string | null
          last_seen?: string | null
          lifecycle_state?: string
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          lost_at?: string | null
          monday_item_id?: string | null
          name?: string
          noi_status?: string | null
          normalized_name?: string | null
          notes?: string | null
          outlook_folder?: string | null
          project_number?: string | null
          promoted_at?: string | null
          search_vector?: unknown
          seed_key?: string | null
          seed_source?: string | null
          signs_status?: string | null
          swppp_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_orders: {
        Row: {
          created_at: string
          draft_id: string | null
          id: number
          mailbox_email: string
          message_id: string | null
          metadata: Json
          noi_azc: string | null
          permit_id: string | null
          project_id: number | null
          project_name: string
          quantity: number
          requested_by_email: string
          sign_details: string
          sign_type: string
          status: string
          subject: string
          updated_at: string
          vendor_email: string
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          id?: number
          mailbox_email: string
          message_id?: string | null
          metadata?: Json
          noi_azc?: string | null
          permit_id?: string | null
          project_id?: number | null
          project_name: string
          quantity?: number
          requested_by_email: string
          sign_details: string
          sign_type: string
          status?: string
          subject: string
          updated_at?: string
          vendor_email?: string
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          id?: number
          mailbox_email?: string
          message_id?: string | null
          metadata?: Json
          noi_azc?: string | null
          permit_id?: string | null
          project_id?: number | null
          project_name?: string
          quantity?: number
          requested_by_email?: string
          sign_details?: string
          sign_type?: string
          status?: string
          subject?: string
          updated_at?: string
          vendor_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "sign_orders_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "dust_permits_filed_by_desert_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sign_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "sign_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholders: {
        Row: {
          created_at: string | null
          email: string
          event_type: string
          id: number
          is_active: number | null
          name: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          event_type: string
          id?: number
          is_active?: number | null
          name?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          event_type?: string
          id?: number
          is_active?: number | null
          name?: string | null
          role?: string | null
        }
        Relationships: []
      }
      swppp_work_orders: {
        Row: {
          account_id: number | null
          address: string | null
          comments: string | null
          contact: string | null
          contractor: string | null
          date: string | null
          date_entered: string | null
          id: number
          invoice: string | null
          job_name: string | null
          phone: string | null
          project_id: number | null
          row_number: number
          synced_at: string
          work_completed: string | null
          work_description: string | null
          worksheet: string
        }
        Insert: {
          account_id?: number | null
          address?: string | null
          comments?: string | null
          contact?: string | null
          contractor?: string | null
          date?: string | null
          date_entered?: string | null
          id?: number
          invoice?: string | null
          job_name?: string | null
          phone?: string | null
          project_id?: number | null
          row_number: number
          synced_at?: string
          work_completed?: string | null
          work_description?: string | null
          worksheet: string
        }
        Update: {
          account_id?: number | null
          address?: string | null
          comments?: string | null
          contact?: string | null
          contractor?: string | null
          date?: string | null
          date_entered?: string | null
          id?: number
          invoice?: string | null
          job_name?: string | null
          phone?: string | null
          project_id?: number | null
          row_number?: number
          synced_at?: string
          work_completed?: string | null
          work_description?: string | null
          worksheet?: string
        }
        Relationships: [
          {
            foreignKeyName: "swppp_work_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swppp_work_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "swppp_work_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      takeoffs: {
        Row: {
          annotations: string
          created_at: string | null
          id: string
          name: string
          page_scales: string
          pdf_url: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          annotations?: string
          created_at?: string | null
          id: string
          name: string
          page_scales?: string
          pdf_url?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          annotations?: string
          created_at?: string | null
          id?: string
          name?: string
          page_scales?: string
          pdf_url?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tracked_folders: {
        Row: {
          created_at: string | null
          display_name: string
          folder_id: string
          id: number
          last_synced_at: string | null
          message_count: number | null
          messages_delta_link: string | null
          parent_folder_id: string
          project_id: number | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          folder_id: string
          id?: number
          last_synced_at?: string | null
          message_count?: number | null
          messages_delta_link?: string | null
          parent_folder_id: string
          project_id?: number | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          folder_id?: string
          id?: number
          last_synced_at?: string | null
          message_count?: number | null
          messages_delta_link?: string | null
          parent_folder_id?: string
          project_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tracked_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contract_packet_queue_v: {
        Row: {
          counterparty_responded_at: string | null
          counterparty_response_due_at: string | null
          created_at: string | null
          estimate_id: number | null
          executed_at: string | null
          id: number | null
          is_active: boolean | null
          is_sla_breached: boolean | null
          legacy_contract_status: string | null
          metadata: Json | null
          minutes_since_received: number | null
          next_action: string | null
          notes: string | null
          owner: string | null
          packet_document_count: number | null
          packet_type: string | null
          primary_contract_count: number | null
          project_id: number | null
          project_name: string | null
          received_at: string | null
          requested_at: string | null
          required_document_count: number | null
          sent_back_at: string | null
          sla_minutes: number | null
          source_email_id: number | null
          status: string | null
          triage_completed_at: string | null
          triage_started_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_packets_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "contract_packets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "email_list_dedup_mv"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_packets_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "project_email_dedup_mv"
            referencedColumns: ["canonical_email_id"]
          },
        ]
      }
      email_list_dedup_mv: {
        Row: {
          account_id: number | null
          attachment_names: string | null
          body_preview: string | null
          categories: string | null
          cc_emails: string | null
          classification: string | null
          classification_confidence: number | null
          classification_method: string | null
          contractor_name: string | null
          conversation_id: string | null
          created_at: string | null
          from_domain: string | null
          from_email: string | null
          from_name: string | null
          has_attachments: number | null
          id: number | null
          internet_message_id: string | null
          is_excluded: number | null
          is_forwarded: number | null
          is_internal: number | null
          is_platform_email: number | null
          mailbox_id: number | null
          message_id: string | null
          normalized_subject: string | null
          original_sender_domain: string | null
          original_sender_email: string | null
          platform_name: string | null
          project_id: number | null
          project_name: string | null
          real_sender_company: string | null
          real_sender_domain: string | null
          real_sender_email: string | null
          real_sender_name: string | null
          received_at: string | null
          recipient_count: number | null
          subject: string | null
          thread_id: string | null
          to_emails: string | null
          web_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_email_dedup_mv: {
        Row: {
          canonical_email_id: number | null
          canonical_from_email: string | null
          canonical_normalized_subject: string | null
          canonical_received_at: string | null
          canonical_subject: string | null
          duplicate_row_count: number | null
          email_row_count: number | null
          first_received_at: string | null
          has_permit_signal: boolean | null
          last_received_at: string | null
          mailbox_count: number | null
          mailbox_emails: string[] | null
          message_key: string | null
          project_id: number | null
          rows_with_attachments: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_search_index"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "emails_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_search_index: {
        Row: {
          project_id: number | null
          raw_text: string | null
          search_vector: unknown
        }
        Relationships: []
      }
    }
    Functions: {
      propagate_document_project_ids: {
        Args: never
        Returns: {
          total_updated: number
          via_email: number
          via_estimate: number
        }[]
      }
      recompute_document_project_id: {
        Args: { p_document_id: number }
        Returns: number
      }
      recompute_email_project_id: {
        Args: { p_email_id: number }
        Returns: number
      }
      run_estimate_extraction_triage: {
        Args: { p_estimate_column_id?: string; p_max_rows?: number }
        Returns: {
          candidate_rows: number
          marked_non_pdf: number
          processed_rows: number
          reset_to_pending: number
          skipped_no_asset: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

