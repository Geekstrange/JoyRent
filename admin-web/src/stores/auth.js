// File Name: auth.js
// Created Time: 2026-09-22 19:36:45
// Update Time: 2026-09-22 19:36:45


import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: '',
      admin: null,
      setAuth: (token, admin) => set({ token, admin }),
      logout: () => set({ token: '', admin: null }),
    }),
    {
      name: 'rental-admin-auth',
      partialize: (state) => ({ token: state.token, admin: state.admin }),
    }
  )
)
