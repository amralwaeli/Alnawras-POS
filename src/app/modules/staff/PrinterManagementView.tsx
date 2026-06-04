import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Printer, Wifi, Usb, ChefHat, CheckCircle2, XCircle, Pencil } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { toast } from 'sonner';
import { usePOS } from '../../context/POSContext';
import { loadStations, saveStations } from '../../models/types';
import type { Printer as PrinterType, Station } from '../../models/types';

// ── Storage helpers ───────────────────────────────────────────────────────────

const PRINTERS_KEY = 'alnawras_printers';

function loadPrinters(branchId: string): PrinterType[] {
  try {
    const raw = localStorage.getItem(PRINTERS_KEY);
    if (!raw) return [];
    const all: PrinterType[] = JSON.parse(raw);
    return all.filter(p => p.branchId === branchId);
  } catch { return []; }
}

function savePrinters(branchId: string, printers: PrinterType[]) {
  try {
    const raw = localStorage.getItem(PRINTERS_KEY);
    const all: PrinterType[] = raw ? JSON.parse(raw) : [];
    const otherBranch = all.filter(p => p.branchId !== branchId);
    localStorage.setItem(PRINTERS_KEY, JSON.stringify([...otherBranch, ...printers]));
  } catch { /* ignore */ }
}

// ── Badge helper ──────────────────────────────────────────────────────────────

function stationBadgeStyle(color: string) {
  return {
    backgroundColor: color + '22',
    color,
    border: `1px solid ${color}55`,
  };
}

// ── Station Dialog ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#f97316', // orange
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#eab308', // yellow
  '#14b8a6', // teal
  '#64748b', // slate
  '#8b5cf6', // violet
];

function StationDialog({
  open,
  station,
  onClose,
  onSave,
}: {
  open: boolean;
  station: Station | null;
  onClose: () => void;
  onSave: (s: Station) => void;
}) {
  const [name, setName]   = useState('');
  const [color, setColor] = useState(PRESET_COLORS[2]);

  useEffect(() => {
    if (open) {
      setName(station?.name ?? '');
      setColor(station?.color ?? PRESET_COLORS[2]);
    }
  }, [open, station]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Station name is required'); return; }
    onSave({
      id: station?.id ?? name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      name: name.trim(),
      color,
      isBuiltIn: station?.isBuiltIn ?? false,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{station ? 'Edit Station' : 'Add Station'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="station-name">Station Name</Label>
            <Input
              id="station-name"
              placeholder="e.g. Grill, Bar, Pastry…"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={station?.isBuiltIn}
              required
            />
            {station?.isBuiltIn && (
              <p className="text-xs text-gray-400 mt-1">Built-in station name cannot be changed</p>
            )}
          </div>

          <div>
            <Label>Badge Color</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#000' : 'transparent',
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="size-7 rounded-full border border-gray-300 cursor-pointer"
                title="Custom color"
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">Preview:</span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={stationBadgeStyle(color)}
              >
                {name || 'Station'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{station ? 'Update' : 'Add'} Station</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Printer Dialog ────────────────────────────────────────────────────────────

const emptyPrinterForm = {
  name: '',
  type: 'network' as 'network' | 'usb',
  ipAddress: '',
  port: '9100',
  usbPath: '',
  stations: [] as string[],
  isActive: true,
};

function PrinterDialog({
  open,
  printer,
  stations,
  onClose,
  onSave,
}: {
  open: boolean;
  printer: PrinterType | null;
  stations: Station[];
  onClose: () => void;
  onSave: (p: Omit<PrinterType, 'id' | 'branchId' | 'createdAt'> & { id?: string }) => void;
}) {
  const [form, setForm] = useState({ ...emptyPrinterForm });

  useEffect(() => {
    if (open) {
      setForm(printer ? {
        name: printer.name,
        type: printer.type,
        ipAddress: printer.ipAddress ?? '',
        port: printer.port?.toString() ?? '9100',
        usbPath: printer.usbPath ?? '',
        stations: printer.stations,
        isActive: printer.isActive,
      } : { ...emptyPrinterForm });
    }
  }, [open, printer]);

  const toggleStation = (stationId: string) =>
    setForm(prev => ({
      ...prev,
      stations: prev.stations.includes(stationId)
        ? prev.stations.filter(s => s !== stationId)
        : [...prev.stations, stationId],
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Printer name is required'); return; }
    if (form.type === 'network' && !form.ipAddress.trim()) { toast.error('IP address is required'); return; }
    if (form.type === 'usb' && !form.usbPath.trim()) { toast.error('USB path is required'); return; }
    onSave({
      id: printer?.id,
      name: form.name.trim(),
      type: form.type,
      ipAddress: form.type === 'network' ? form.ipAddress.trim() : undefined,
      port: form.type === 'network' ? parseInt(form.port) || 9100 : undefined,
      usbPath: form.type === 'usb' ? form.usbPath.trim() : undefined,
      stations: form.stations,
      isActive: form.isActive,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{printer ? 'Edit Printer' : 'Add Printer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="printer-name">Printer Name</Label>
            <Input
              id="printer-name"
              placeholder="e.g. Kitchen Epson TM-T20"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label>Connection Type</Label>
            <Select value={form.type} onValueChange={(v: 'network' | 'usb') => setForm(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input id="printer-ip" placeholder="192.168.1.100" value={form.ipAddress}
                  onChange={e => setForm(p => ({ ...p, ipAddress: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="printer-port">Port</Label>
                <Input id="printer-port" type="number" value={form.port}
                  onChange={e => setForm(p => ({ ...p, port: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="printer-usb">USB Port / Path</Label>
              <Input id="printer-usb" placeholder="e.g. COM3 or /dev/usb/lp0" value={form.usbPath}
                onChange={e => setForm(p => ({ ...p, usbPath: e.target.value }))} />
            </div>
          )}

          <div>
            <Label>Assigned Stations</Label>
            <p className="text-xs text-gray-500 mb-2">Orders from these stations will be sent to this printer</p>
            {stations.length === 0 ? (
              <p className="text-xs text-amber-600 italic">No stations defined yet — add stations first</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {stations.map(s => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      form.stations.includes(s.id) ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.stations.includes(s.id)}
                      onChange={() => toggleStation(s.id)}
                      className="accent-orange-500"
                    />
                    <ChefHat className="size-4 text-gray-400 shrink-0" />
                    <span className="text-sm font-medium flex-1">{s.name}</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={stationBadgeStyle(s.color)}
                    >
                      {s.id}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{printer ? 'Update' : 'Add'} Printer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function PrinterManagementView() {
  const { currentUser } = usePOS();
  const branchId = currentUser?.branchId ?? 'branch-1';

  const [stations, setStations] = useState<Station[]>(() => loadStations());
  const [printers, setPrinters] = useState<PrinterType[]>(() => loadPrinters(branchId));

  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [editingStation, setEditingStation]        = useState<Station | null>(null);

  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [editingPrinter, setEditingPrinter]        = useState<PrinterType | null>(null);

  useEffect(() => { saveStations(stations); }, [stations]);
  useEffect(() => { savePrinters(branchId, printers); }, [printers, branchId]);

  // ── Station handlers ──────────────────────────────────────────────────────

  const handleSaveStation = (s: Station) => {
    setStations(prev => {
      const exists = prev.find(x => x.id === s.id);
      return exists ? prev.map(x => x.id === s.id ? s : x) : [...prev, s];
    });
    toast.success(editingStation ? 'Station updated' : 'Station added');
    setEditingStation(null);
  };

  const handleDeleteStation = (id: string) => {
    setStations(prev => prev.filter(s => s.id !== id));
    // Remove this station from any printer that had it assigned
    setPrinters(prev => prev.map(p => ({
      ...p,
      stations: p.stations.filter(s => s !== id),
    })));
    toast.success('Station removed');
  };

  // ── Printer handlers ──────────────────────────────────────────────────────

  const handleSavePrinter = (data: Omit<PrinterType, 'id' | 'branchId' | 'createdAt'> & { id?: string }) => {
    if (data.id) {
      setPrinters(prev => prev.map(p => p.id === data.id ? { ...p, ...data, id: p.id } : p));
      toast.success('Printer updated');
    } else {
      setPrinters(prev => [...prev, {
        ...data,
        id: crypto.randomUUID(),
        branchId,
        createdAt: new Date().toISOString(),
      } as PrinterType]);
      toast.success('Printer added');
    }
    setEditingPrinter(null);
  };

  const handleDeletePrinter = (id: string) => {
    setPrinters(prev => prev.filter(p => p.id !== id));
    toast.success('Printer removed');
  };

  const toggleActive = (id: string) =>
    setPrinters(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p));

  const stationById = (id: string) => stations.find(s => s.id === id);

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Printers</h1>
        <p className="text-gray-600">Manage preparation stations and assign printers to them</p>
      </div>

      {/* ── Stations ───────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Stations</h2>
            <p className="text-sm text-gray-500">Define where orders are prepared</p>
          </div>
          <Button size="sm" onClick={() => { setEditingStation(null); setStationDialogOpen(true); }}>
            <Plus className="size-4 mr-1" /> Add Station
          </Button>
        </div>

        {stations.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-xl">
            <ChefHat className="size-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No stations yet — add your first one</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {stations.map(s => {
              const assignedPrinters = printers.filter(p => p.isActive && p.stations.includes(s.id));
              return (
                <Card key={s.id} className="relative">
                  <CardContent className="py-4 px-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={stationBadgeStyle(s.color)}
                      >
                        {s.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingStation(s); setStationDialogOpen(true); }}
                          className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Edit station"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {!s.isBuiltIn && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete station">
                                <Trash2 className="size-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Station</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove "{s.name}"? It will also be unassigned from all printers.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteStation(s.id)} className="bg-red-600 hover:bg-red-700">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                    {assignedPrinters.length > 0
                      ? <p className="text-xs text-gray-500 truncate">{assignedPrinters.map(p => p.name).join(', ')}</p>
                      : <p className="text-xs text-amber-500">No printer assigned</p>
                    }
                    {s.isBuiltIn && (
                      <p className="text-xs text-gray-300 mt-1">Built-in</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Printers ───────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Printers</h2>
            <p className="text-sm text-gray-500">Connect printers and assign them to stations</p>
          </div>
          <Button size="sm" onClick={() => { setEditingPrinter(null); setPrinterDialogOpen(true); }}>
            <Plus className="size-4 mr-1" /> Add Printer
          </Button>
        </div>

        {printers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl">
            <Printer className="size-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-500 mb-1">No printers configured</p>
            <p className="text-sm text-gray-400 mb-4">Add a printer and assign it to a station</p>
            <Button size="sm" onClick={() => { setEditingPrinter(null); setPrinterDialogOpen(true); }}>
              <Plus className="size-4 mr-1" /> Add Printer
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
                    <button onClick={() => toggleActive(printer.id)} title={printer.isActive ? 'Disable' : 'Enable'} className="shrink-0">
                      {printer.isActive
                        ? <CheckCircle2 className="size-4 text-emerald-500" />
                        : <XCircle className="size-4 text-gray-400" />
                      }
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-500">
                    {printer.type === 'network'
                      ? `${printer.ipAddress}:${printer.port}`
                      : `USB — ${printer.usbPath}`
                    }
                  </p>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Stations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {printer.stations.length === 0
                        ? <span className="text-xs text-gray-400 italic">None assigned</span>
                        : printer.stations.map(sid => {
                            const st = stationById(sid);
                            return (
                              <span
                                key={sid}
                                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={stationBadgeStyle(st?.color ?? '#64748b')}
                              >
                                {st?.name ?? sid}
                              </span>
                            );
                          })
                      }
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => { setEditingPrinter(printer); setPrinterDialogOpen(true); }} className="flex-1">
                      <Edit className="size-3.5 mr-1" /> Edit
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
                          <AlertDialogDescription>Remove "{printer.name}"? This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeletePrinter(printer.id)} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <StationDialog
        open={stationDialogOpen}
        station={editingStation}
        onClose={() => { setStationDialogOpen(false); setEditingStation(null); }}
        onSave={handleSaveStation}
      />
      <PrinterDialog
        open={printerDialogOpen}
        printer={editingPrinter}
        stations={stations}
        onClose={() => { setPrinterDialogOpen(false); setEditingPrinter(null); }}
        onSave={handleSavePrinter}
      />
    </div>
  );
}
