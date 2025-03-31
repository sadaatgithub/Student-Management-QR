let html5QrCode;
let currentTeacher = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user || user.role !== 'teacher') {
        window.location.href = '/index.html';
        return;
    }

    // Initialize teacher data
    currentTeacher = user;
    document.getElementById('teacherName').textContent = currentTeacher.name;

    // Initialize QR scanner
    html5QrCode = new Html5Qrcode("qrScanner");

    // Load lectures
    loadLectures();

    // Setup create lecture form
    document.getElementById('createLectureForm').addEventListener('submit', handleCreateLecture);
});

async function loadLectures() {
    try {
        const response = await fetch('/api/lectures/teacher', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load lectures');

        const lectures = await response.json();
        console.log('Loaded lectures:', lectures); // Debug log
        displayLectures(lectures);
    } catch (error) {
        console.error('Error loading lectures:', error);
        alert('Failed to load lectures');
    }
}

function displayLectures(lectures) {
    const lecturesList = document.getElementById('lecturesList');
    if (!lecturesList) return;

    // Sort lectures by date and time
    lectures.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime}`);
        const dateB = new Date(`${b.date}T${b.startTime}`);
        return dateA - dateB;
    });

    // Get current date and time
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    // Display all lectures
    if (lectures.length > 0) {
        lecturesList.innerHTML = lectures.map(lecture => {
            const isToday = lecture.date === today;
            const isOngoing = isToday && 
                             lecture.startTime <= currentTime && 
                             lecture.endTime >= currentTime;
            
            return `
                <div class="lecture-card ${isOngoing ? 'ongoing' : ''}">
                    <h3 class="lecture-title">${lecture.title || 'Lecture'}</h3>
                    <p class="lecture-info">Date: ${new Date(lecture.date).toLocaleDateString()}</p>
                    <p class="lecture-info">Time: ${lecture.startTime} - ${lecture.endTime}</p>
                    <p class="lecture-info">Status: ${lecture.status}</p>
                    <div class="lecture-actions">
                        <button class="btn primary-btn" onclick="showQRScanner('${lecture._id}')">
                            <i class="fas fa-qrcode"></i>
                            Mark Attendance
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        lecturesList.innerHTML = '<p class="no-lectures">No lectures scheduled</p>';
    }
}

async function handleCreateLecture(event) {
    event.preventDefault();
    
    const formData = {
        title: document.getElementById('lectureTitle').value,
        description: document.getElementById('lectureDescription').value,
        date: document.getElementById('lectureDate').value,
        startTime: document.getElementById('lectureStartTime').value,
        endTime: document.getElementById('lectureEndTime').value,
        department: currentTeacher.department
    };

    try {
        const response = await fetch('/api/lectures', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create lecture');
        }

        const newLecture = await response.json();
        alert('Lecture created successfully!');
        closeCreateLectureModal();
        
        // Reload lectures to show the newly created lecture
        await loadLectures();
        
        // Reset the form
        event.target.reset();
    } catch (error) {
        console.error('Error creating lecture:', error);
        alert(error.message || 'Failed to create lecture. Please try again.');
    }
}

function showCreateLectureModal() {
    document.getElementById('createLectureModal').style.display = 'block';
}

function closeCreateLectureModal() {
    document.getElementById('createLectureModal').style.display = 'none';
}

async function showQRScanner(lectureId) {
    const modal = document.getElementById('qrScannerModal');
    modal.style.display = 'block';

    try {
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) =>onScanSuccess(decodedText, lectureId),
            onScanError
        );
    } catch (error) {
        console.error('Error starting QR scanner:', error);
        alert('Failed to start QR scanner. Please make sure you have camera permissions enabled.');
    }
}

function closeQRScannerModal() {
    const modal = document.getElementById('qrScannerModal');
    modal.style.display = 'none';
    
    // Clear the scan result
    const scanResult = document.getElementById('scanResult');
    if (scanResult) {
        scanResult.innerHTML = '';
    }
    
    // Stop the QR scanner
    html5QrCode.stop().catch(error => {
        console.error('Error stopping QR scanner:', error);
    });
}

async function onScanSuccess(decodedText, lectureId) {
    try {
        const qrData = JSON.parse(decodedText);
        console.log('Scanning QR for lecture:', lectureId); // Debug log
        
        // Create the complete QR data with lecture information
        const completeQrData = JSON.stringify({
            studentId: qrData.studentId,
            lectureId: lectureId,
            teacherId: currentTeacher.id,
            timestamp: Date.now()
        });

        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                qrData: completeQrData,
                studentId: qrData.studentId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to mark attendance');
        }

        const result = await response.json();
        const scanResult = document.getElementById('scanResult');
        scanResult.innerHTML = `
            <p class="success">
                ${result.message || 'Attendance marked successfully!'}
            </p>
        `;

        // Stop the QR scanner
        try {
            await html5QrCode.stop();
        } catch (error) {
            console.error('Error stopping QR scanner:', error);
        }

        // Close the modal after 2 seconds
        setTimeout(() => {
            closeQRScannerModal();
        }, 2000);
    } catch (error) {
        console.error('Error marking attendance:', error);
        document.getElementById('scanResult').innerHTML = `
            <p class="error">${error.message || 'Failed to mark attendance'}</p>
        `;
    }
}

function onScanError(error) {
    // Ignore errors during scanning
    console.debug('QR Scan error:', error);
}

async function viewAttendance(lectureId) {
    try {
        const response = await fetch(`/api/attendance/teacher-report/${lectureId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Failed to load attendance');

        const attendance = await response.json();
        displayAttendanceReport(attendance);
    } catch (error) {
        console.error('Error loading attendance:', error);
        alert('Failed to load attendance report');
    }
}

function displayAttendanceReport(attendance) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h2>Attendance Report</h2>
            <table class="attendance-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Student ID</th>
                        <th>Status</th>
                        <th>Marked At</th>
                    </tr>
                </thead>
                <tbody>
                    ${attendance.map(record => `
                        <tr>
                            <td>${record.student.name}</td>
                            <td>${record.student.studentId}</td>
                            <td>${record.status}</td>
                            <td>${new Date(record.markedAt).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    document.body.appendChild(modal);
}

function viewLectureDetails(lectureId) {
    // Implement lecture details view
    console.log('Viewing lecture details:', lectureId);
}

function manageStudents() {
    // Implement student management view
    console.log('Opening student management');
}

function viewAllActivity() {
    // Implement view all activity
    console.log('Viewing all activity');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/index.html';
}