/
   * Update staff member in database
   */
  static async updateStaff(
    staffId: string,
    updates: Partial<Staff>
  ): Promise<{ success: boolean; data?: Staff; error?: string }> {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.employmentNumber !== undefined) dbUpdates.employment_number = updates.employmentNumber;
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.pin !== undefined) dbUpdates.pin = updates.pin;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.branchId !== undefined) dbUpdates.branch_id = updates.branchId;

      const { data, error } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', staffId)
        .select()
        .single();

      if (error) {
        console.error('Error updating staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: mapDbRowToStaff(data) };
    } catch (err) {
      console.error('Error in updateStaff:', err);
      return { success: false, error: 'Failed to update staff member' };
    }
  }

  /
   * Delete staff member from database
   */
  static async deleteStaff(staffId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', staffId);

      if (error) {
        console.error('Error deleting staff:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('Error in deleteStaff:', err);
      return { success: false, error: 'Failed to delete staff member' };
    }
  }
}