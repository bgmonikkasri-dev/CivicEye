import React from 'react';

const DetectionCard = ({ complaint, apiBase, toggleStatus }) => {
  const {
    id,
    image_url,
    issue_type = "Pothole",
    department = "Roads",
    detection_count = 2,
    severity = "high",
    priority = "high",
    confidence = 0.87,
    location = "Coimbatore",
    reported_at = new Date().toISOString(),
    status = "new"
  } = complaint;

  const titleCase = (s) => (s || "Unknown").replace(/\b\w/g, c => c.toUpperCase());

  // Colors based on priority/severity
  const getSeverityColor = (level) => {
    switch(level?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityDot = (level) => {
    switch(level?.toLowerCase()) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="complaint">
      
      {/* LEFT SECTION - Image */}
      <div className="complaint-image">
        {image_url ? (
          <div className="relative w-full h-full">
            <img 
              src={`${apiBase}${image_url}`} 
              alt={`Detection`} 
            />
            
            {/* Bounding Box Overlay */}
            <div className="absolute top-0 left-0 w-full h-full">
              {(complaint.detections || [
                { x: 35, y: 30, width: 25, height: 20, label: titleCase(issue_type), confidence: confidence ? Math.round(confidence * 100) : 87 }
              ]).map((box, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-red-500 bg-red-500/20"
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                >
                  <span className="absolute -top-6 left-0 bg-red-500 text-white text-xs font-bold px-1 whitespace-nowrap">
                    {box.label} ({box.confidence}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-slate-400 font-medium my-auto flex h-full items-center justify-center">No Image Available</div>
        )}
      </div>

      {/* RIGHT SECTION */}
      <div className="complaint-content">
        
        {/* Header / Complaint Summary */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Complaint Summary</span>
            <span className="text-xs text-slate-400">{new Date(reported_at).toLocaleString()}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1 flex items-center gap-2 flex-wrap">
            {titleCase(issue_type)}
            {complaint.is_duplicate ? (
              <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                ⚠️ Duplicate Flag
              </span>
            ) : null}
            {complaint.repair_image_url ? (
              <span className="text-xs bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-full font-bold">
                🛠️ Repair Photo Attached
              </span>
            ) : null}
          </h2>
          <p className="text-sm text-slate-500">
            {detection_count} detection{detection_count !== 1 ? 's' : ''} • Auto Assigned: <span className="font-semibold text-slate-700">{titleCase(department)}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* AI Analysis */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚠️</span>
              <h3 className="text-sm font-bold text-slate-700">AI Analysis</h3>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Severity</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getSeverityColor(severity)}`}>
                  {titleCase(severity)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Confidence</span>
                <span className="font-semibold text-slate-700">{confidence ? Math.round(confidence * 100) : 0}%</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Est. Damage</span>
                <span className="font-semibold text-slate-700">14% Area</span>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📍</span>
              <h3 className="text-sm font-bold text-slate-700">Metadata</h3>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Location</span>
                <span className="font-semibold text-slate-700 truncate max-w-[100px]" title={location}>{location}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Priority</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${getPriorityDot(priority)}`}></span>
                  <span className={`font-bold ${priority?.toLowerCase() === 'high' ? 'text-red-600' : 'text-slate-700'}`}>
                    {titleCase(priority)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Est. Repair</span>
                <span className="font-semibold text-slate-700">~2 Hours</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔧</span>
              <span className="text-sm font-bold text-slate-700">Actions</span>
            </div>
            <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
              Current: {titleCase(status)}
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); toggleStatus(id, "in progress"); }}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm shadow-sm cursor-pointer border-0"
            >
              Mark In Progress
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); toggleStatus(id, "resolved"); }}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm shadow-sm cursor-pointer border-0"
            >
              Mark Resolved
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DetectionCard;
