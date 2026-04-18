import React, { useState } from 'react';
import { Plus, Edit, Trash2, Users, Hash } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

export function TableManagementView() {
  const { tables, addTable, updateTable, deleteTable, users } = usePOS();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<any>(null);
  const [formData, setFormData] = useState({
    number: '',
    capacity: '',
    assignedCashierId: '',
  });

  const resetForm = () => {
    setFormData({
      number: '',
      capacity: '',
      assignedCashierId: '',
    });
    setEditingTable(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tableData = {
      number: parseInt(formData.number),
      capacity: parseInt(formData.capacity),
    };

    try {
      if (editingTable) {
        const result = await updateTable(editingTable.id, {
          ...tableData,
          assignedCashierId: formData.assignedCashierId || undefined,
        });
        if (result.success) {
          toast.success('Table updated successfully');
          setIsAddDialogOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to update table');
        }
      } else {
        const result = await addTable(tableData);
        if (result.success) {
          toast.success('Table added successfully');
          setIsAddDialogOpen(false);
          resetForm();
        } else {
          toast.error(result.error || 'Failed to add table');
        }
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const handleEdit = (table: any) => {
    setEditingTable(table);
    setFormData({
      number: table.number.toString(),
      capacity: table.capacity.toString(),
      assignedCashierId: table.assignedCashierId || '',
    });
    setIsAddDialogOpen(true);
  };

  const handleDelete = async (tableId: string) => {
    try {
      const result = await deleteTable(tableId);
      if (result.success) {
        toast.success('Table deleted successfully');
      } else {
        toast.error(result.error || 'Failed to delete table');
      }
    } catch (error) {
      toast.error('An error occurred');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'occupied': return 'bg-red-100 text-red-800';
      case 'reserved': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const cashiers = users.filter(user => user.role === 'cashier');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Table Management</h1>
          <p className="text-gray-600">Manage restaurant tables and assignments</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="size-4 mr-2" />
              Add Table
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTable ? 'Edit Table' : 'Add New Table'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="number">Table Number</Label>
                <Input
                  id="number"
                  type="number"
                  value={formData.number}
                  onChange={(e) => setFormData(prev => ({ ...prev, number: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="capacity">Capacity</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cashier">Assigned Cashier (Optional)</Label>
                <Select value={formData.assignedCashierId || 'none'} onValueChange={(value) => setFormData(prev => ({ ...prev, assignedCashierId: value === 'none' ? '' : value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cashier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {cashiers.map(cashier => (
                      <SelectItem key={cashier.id} value={cashier.id}>
                        {cashier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingTable ? 'Update' : 'Add'} Table
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tables.map(table => (
          <div key={table.id} className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Hash className="size-5 text-gray-500" />
                <span className="font-semibold">Table {table.number}</span>
              </div>
              <Badge className={getStatusColor(table.status)}>
                {table.status}
              </Badge>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="size-4" />
                <span>Capacity: {table.capacity}</span>
              </div>
              {table.assignedCashierId && (
                <div className="text-sm text-gray-600">
                  Cashier: {users.find(u => u.id === table.assignedCashierId)?.name || 'Unknown'}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEdit(table)}
                className="flex-1"
              >
                <Edit className="size-4 mr-1" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Table</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete Table {table.number}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(table.id)} className="bg-red-600 hover:bg-red-700">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-12">
          <Hash className="size-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tables found</h3>
          <p className="text-gray-600 mb-4">Get started by adding your first table.</p>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="size-4 mr-2" />
            Add Table
          </Button>
        </div>
      )}
    </div>
  );
}