import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Printer, Wifi, Usb, ChefHat, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { toast } from 'sonner';
import { usePOS } from '../../context/POSContext';
import type { Printer as PrinterType, PrinterStation } from '../../models/types';

const STORAGE_KEY = 'alnawras_printers';

const STATIONS: { value: PrinterStation; label: string; color: string }[] = [
  { value: 'kitchen', label: 'Kitchen', color: 'bg-orange-100 text-orange-700' },
  { value: 'juice',   label: 'Juice Bar', color: 'bg-green-100 text-green-700' },
];

function loadPrinters(branchId: string): PrinterType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all: PrinterType[] = JSON.parse(raw);
    return all.filter(p => p.branchId === branchId);
  } catch {
    return [];
  }
}

function savePrinters(branchId: string, printers: PrinterType[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: PrinterType[] = raw ? JSON.parse(raw) : [];
    const otherBranch = all.filter(p => p.branchId !== branchId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...otherBranch, ...printers]));
  } catch {
    // ignore
  }
}

const emptyForm = {
  name: '',
  type: 'network' as 'network' | 'usb',
  ipAddress: '',
  port: '9100',
  usbPath: '',
  stations: [] as PrinterStation[],
  isActive: true,
};

export function PrinterManagementView() {
  const { currentUser } = usePOS();
  const branchId = currentUser?.branchId || 'branch-1';

  const [printers, setPrinters] = useState<PrinterType[]>(() => loadPrinters(branchId));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    savePrinters(branchId, printers);
  }, [printers, branchId]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (printer: PrinterType) => {
    setEditingId(printer.id);
    setForm({
      name: printer.name,
      type: printer.type,
      ipAddress: printer.ipAddress || '',
      port: printer.port?.toString() || '9100',
      usbPath: printer.usbPath || '',
      stations: printer.stations,
      isActive: printer.isActive,
    });
    setIsDialogOpen(true);
  };

  const toggleStation = (station: PrinterStation) => {
    setForm(prev => ({
      ...prev,
      stations: prev.stations.includes(station)
        ? prev.stations.filter(s => s !== station)
        : [...prev.stations, station],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Printer name is required');
      return;
    }
    if (form.type === 'network' && !form.ipAddress.trim()) {
      toast.error('IP address is required for network printers');
      return;
    }
    if (form.type === 'usb' && !form.usbPath.trim()) {
      toast.error('USB path / port name is required');
      return;
    }

    if (editingId) {
      setPrinters(prev => prev.map(p =>
        p.id === editingId
          ? {
              ...p,
              name: form.name.trim(),
              type: form.type,
              ipAddress: form.type === 'network' ? form.ipAddress.trim() : undefined,
              port: form.type === 'network' ? parseInt(form.port) || 9100 : undefined,
              usbPath: form.type === 'usb' ? form.usbPath.trim() : undefined,
              stations: form.stations,
              isActive: form.isActive,
            }
          : p
      ));
      toast.success('Printer updated');
    } else {
      const newPrinter: PrinterType = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        type: form.type,
        ipAddress: form.type === 'network' ? form.ipAddress.trim() : undefined,
        port: form.type === 'network' ? parseInt(form.port) || 9100 : undefined,
        usbPath: form.type === 'usb' ? form.usbPath.trim() : undefined,
        stations: form.stations,
        isActive: form.isActive,
        branchId,
        createdAt: new Date().toISOString(),
      };
      setPrinters(prev => [...prev, newPrinter]);
      toast.success('Printer added');
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    setPrinters(prev => prev.filter(p => p.id !== id));
    toast.success('Printer removed');
  };

  const toggleActive = (id: string) => {
    setPrinters(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Printers</h1>
          <p className="text-gray-600">Connect printers and assign them to preparation stations</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4 mr-2" />
          Add Printer
        </Button>
      </div>

      {/* Station summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {STATIONS.map(s => {
          const assigned = printers.filter(p => p.isActive && p.stations.includes(s.value));
          return (
            <Card key={s.value} className="border-dashed">
              <CardContent className="flex items-center gap-3 py-4">
                <ChefHat className="size-5 text-gray-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{s.label}</p>
                  {assigned.length > 0
                    ? <p className="text-xs text-gray-500">{assigned.map(p => p.name).join(', ')}</p>
                    : <p className="text-xs text-amber-600">No printer assigned</p>
                  }
                </div>
                <Badge className={s.color}>{assigned.length} printer{assigned.length !== 1 ? 's' : ''}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Printer list */}
      {printers.length === 0 ? (
        <div className="text-center py-16">
          <Printer className="size-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No printers configured</h3>
          <p className="text-gray-500 mb-4">Add a printer and assign it to a station so orders are printed automatically.</p>
          <Button onClick={openAdd}>
            <Plus className="size-4 mr-2" />
            Add Printer
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {printers.map(printer => (
            <Card key={printer.id} className={printer.isActive ? '' : 'opacity-60'}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {printer.type === 'network'
                      ? <Wifi className="size-4 text-blue-500 shrink-0" />
                      : <Usb className="size-4 text-purple-500 shrink-0" />
                    }
                    <CardTitle className="text-base">{printer.name}</CardTitle>
                  </div>
                  <button
                    onClick={() => toggleActive(printer.id)}
                    title={printer.isActive ? 'Disable printer' : 'Enable printer'}
                    className="shrink-0"
                  >
                    {printer.isActive
                      ? <CheckCircle2 className="size-4 text-emerald-500" />
                      : <XCircle className="size-4 text-gray-400" />
                    }
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600">
                  {printer.type === 'network'
                    ? <span>{printer.ipAddress}:{printer.port}</span>
                    : <span>USB — {printer.usbPath}</span>
                  }
                </div>

                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Stations</p>
                  <div className="flex flex-wrap gap-1.5">
                    {printer.stations.length === 0
                      ? <span className="text-xs text-gray-400 italic">None assigned</span>
                      : printer.stations.map(s => {
                          const info = STATIONS.find(st => st.value === s);
                          return (
                            <Badge key={s} className={info?.color}>
                              {info?.label}
                            </Badge>
                          );
                        })
                    }
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(printer)} className="flex-1">
                    <Edit className="size-3.5 mr-1" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Printer</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove "{printer.name}"? Station assignments will be lost.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(printer.id)} className="bg-red-600 hover:bg-red-700">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={isDialogOpen} onOpenChange={open => { if (!open) { setIsDialogOpen(false); resetForm(); } else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Printer' : 'Add Printer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="printer-name">Printer Name</Label>
              <Input
                id="printer-name"
                placeholder="e.g. Kitchen Epson TM-T20"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="printer-type">Connection Type</Label>
              <Select
                value={form.type}
                onValueChange={(v: 'network' | 'usb') => setForm(prev => ({ ...prev, type: v }))}
              >
                <SelectTrigger id="printer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="network">
                    <div className="flex items-center gap-2"><Wifi className="size-3.5" /> Network (IP)</div>
                  </SelectItem>
                  <SelectItem value="usb">
                    <div className="flex items-center gap-2"><Usb className="size-3.5" /> USB / Serial</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === 'network' ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="printer-ip">IP Address</Label>
                  <Input
                    id="printer-ip"
                    placeholder="192.168.1.100"
                    value={form.ipAddress}
                    onChange={e => setForm(prev => ({ ...prev, ipAddress: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="printer-port">Port</Label>
                  <Input
                    id="printer-port"
                    type="number"
                    value={form.port}
                    onChange={e => setForm(prev => ({ ...prev, port: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="printer-usb">USB Port / Path</Label>
                <Input
                  id="printer-usb"
                  placeholder="e.g. COM3  or  /dev/usb/lp0"
                  value={form.usbPath}
                  onChange={e => setForm(prev => ({ ...prev, usbPath: e.target.value }))}
                />
              </div>
            )}

            <div>
              <Label>Assigned Stations</Label>
              <p className="text-xs text-gray-500 mb-2">Orders from these stations will be sent to this printer</p>
              <div className="flex flex-col gap-2">
                {STATIONS.map(s => (
                  <label
                    key={s.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      form.stations.includes(s.value)
                        ? 'border-orange-400 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.stations.includes(s.value)}
                      onChange={() => toggleStation(s.value)}
                      className="accent-orange-500"
                    />
                    <ChefHat className="size-4 text-gray-400" />
                    <span className="text-sm font-medium">{s.label}</span>
                    <Badge className={`ml-auto text-xs ${s.color}`}>{s.value}</Badge>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit">
                {editingId ? 'Update' : 'Add'} Printer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
